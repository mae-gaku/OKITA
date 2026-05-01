"""Phase 3a: 開発用 billing 昇格と本番経路のセキュリティ。

検証ポイント:
- dev-upgrade は development では動く (free → pro → family → free)
- dev-upgrade は production ビルドでは存在しない (= router 未登録)
- /billing/verify は未実装で 501
- 認証必須 (匿名は 401)
- BillingReceipt が記録される
"""

import importlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import db as db_mod
from app import scheduler as sched_mod
from app.db import get_session
from app.models import BillingReceipt, User
from app.security import create_access_token, hash_password


def _make_engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    return eng


def _mk_user(eng, *, handle="me", plan="free") -> User:
    with Session(eng) as s:
        u = User(
            email=f"{handle}@example.com", handle=handle, display_name=handle.upper(),
            password_hash=hash_password("pw123456"), plan=plan,
        )
        s.add(u); s.commit(); s.refresh(u)
        return u


def _auth(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture()
def dev_client(monkeypatch):
    monkeypatch.setenv("OKITA_ENV", "development")
    # config.settings と app をクリーンに再ロードしてルータ登録条件を反映
    import app.config as cfg_mod
    importlib.reload(cfg_mod)
    import app.routers.billing as billing_mod
    importlib.reload(billing_mod)
    import app.main as main_mod
    importlib.reload(main_mod)

    eng = _make_engine()
    monkeypatch.setattr(db_mod, "engine", eng)
    monkeypatch.setattr(sched_mod, "engine", eng)

    def _get_session():
        with Session(eng) as s:
            yield s

    main_mod.app.dependency_overrides[get_session] = _get_session
    with TestClient(main_mod.app) as c:
        c.engine = eng  # type: ignore[attr-defined]
        yield c
    main_mod.app.dependency_overrides.clear()


@pytest.fixture()
def prod_client(monkeypatch):
    monkeypatch.setenv("OKITA_ENV", "production")
    import app.config as cfg_mod
    importlib.reload(cfg_mod)
    import app.routers.billing as billing_mod
    importlib.reload(billing_mod)
    import app.main as main_mod
    importlib.reload(main_mod)

    eng = _make_engine()
    monkeypatch.setattr(db_mod, "engine", eng)
    monkeypatch.setattr(sched_mod, "engine", eng)

    def _get_session():
        with Session(eng) as s:
            yield s

    main_mod.app.dependency_overrides[get_session] = _get_session
    with TestClient(main_mod.app) as c:
        c.engine = eng  # type: ignore[attr-defined]
        yield c
    main_mod.app.dependency_overrides.clear()


# ---------- dev sandbox 昇格 ----------

def test_dev_upgrade_to_pro_changes_plan_and_records_receipt(dev_client):
    eng = dev_client.engine
    me = _mk_user(eng, plan="free")
    r = dev_client.post("/billing/dev-upgrade", json={"plan": "pro"}, headers=_auth(me))
    assert r.status_code == 200
    assert r.json()["plan"] == "pro"
    assert r.json()["last_source"] == "dev"

    # /me/profile にも反映
    r = dev_client.get("/me/profile", headers=_auth(me))
    assert r.json()["plan"] == "pro"

    # レシートが残る
    with Session(eng) as s:
        recs = s.exec(__import__("sqlmodel").select(BillingReceipt)).all()
        assert len(recs) == 1
        assert recs[0].source == "dev"
        assert recs[0].plan == "pro"


def test_dev_upgrade_then_downgrade_to_free(dev_client):
    eng = dev_client.engine
    me = _mk_user(eng, plan="pro")
    r = dev_client.post("/billing/dev-upgrade", json={"plan": "free"}, headers=_auth(me))
    assert r.status_code == 200
    assert r.json()["plan"] == "free"


def test_dev_upgrade_requires_auth(dev_client):
    r = dev_client.post("/billing/dev-upgrade", json={"plan": "pro"})
    assert r.status_code == 401


def test_dev_upgrade_rejects_invalid_plan(dev_client):
    eng = dev_client.engine
    me = _mk_user(eng)
    r = dev_client.post("/billing/dev-upgrade", json={"plan": "tycoon"}, headers=_auth(me))
    assert r.status_code == 422  # pydantic Literal 拒否


# ---------- production では dev-upgrade が存在しない ----------

def test_prod_dev_upgrade_is_404(prod_client):
    eng = prod_client.engine
    me = _mk_user(eng)
    r = prod_client.post("/billing/dev-upgrade", json={"plan": "pro"}, headers=_auth(me))
    assert r.status_code == 404


# ---------- /billing/verify は 501 ----------

def test_verify_returns_501_in_dev(dev_client):
    eng = dev_client.engine
    me = _mk_user(eng)
    r = dev_client.post(
        "/billing/verify",
        json={"jws": "fake.jws.here", "product_id": "x"},
        headers=_auth(me),
    )
    assert r.status_code == 501


def test_verify_returns_501_in_prod(prod_client):
    eng = prod_client.engine
    me = _mk_user(eng)
    r = prod_client.post(
        "/billing/verify",
        json={"jws": "fake.jws.here", "product_id": "x"},
        headers=_auth(me),
    )
    assert r.status_code == 501


# ---------- /billing/status ----------

def test_status_reflects_plan(dev_client):
    eng = dev_client.engine
    me = _mk_user(eng, plan="free")
    r = dev_client.get("/billing/status", headers=_auth(me))
    assert r.status_code == 200
    assert r.json()["plan"] == "free"
    assert r.json()["last_source"] is None
