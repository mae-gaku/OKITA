"""Phase 6: 招待 + 紹介プログラム。

- /me/referral は code を初回呼び出しで生成、2 回目は同じコード
- /invite/{handle} は公開、存在しない handle は 404、不正形式は 400
- /referrals/redeem は: 自己使用 400 / 不存在 404 / 不正形式 400 / 重複 409 / 正常 200
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import db as db_mod
from app import scheduler as sched_mod
from app.db import get_session
from app.main import app
from app.models import ReferralRedemption, User
from app.security import create_access_token, hash_password


@pytest.fixture()
def client(monkeypatch):
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(db_mod, "engine", eng)
    monkeypatch.setattr(sched_mod, "engine", eng)

    def _get_session():
        with Session(eng) as s:
            yield s

    app.dependency_overrides[get_session] = _get_session
    with TestClient(app) as c:
        c.engine = eng  # type: ignore[attr-defined]
        yield c
    app.dependency_overrides.clear()


def _mk(eng, *, handle: str) -> User:
    with Session(eng) as s:
        u = User(
            email=f"{handle}@example.com", handle=handle, display_name=handle.upper(),
            password_hash=hash_password("pw123456"),
        )
        s.add(u); s.commit(); s.refresh(u)
        return u


def _h(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(u.id)}"}


# ---------- /me/referral ----------

def test_referral_code_generated_once_and_stable(client):
    eng = client.engine
    me = _mk(eng, handle="me")
    r1 = client.get("/me/referral", headers=_h(me))
    assert r1.status_code == 200
    code1 = r1.json()["code"]
    assert len(code1) >= 4
    assert r1.json()["invite_url"].endswith(f"/r/{code1}")
    assert r1.json()["handle_url"].endswith("/invite/me")

    r2 = client.get("/me/referral", headers=_h(me))
    assert r2.json()["code"] == code1


def test_referral_requires_auth(client):
    r = client.get("/me/referral")
    assert r.status_code == 401


# ---------- /invite/{handle} ----------

def test_invite_handle_public_lookup(client):
    eng = client.engine
    _mk(eng, handle="alice")
    r = client.get("/invite/alice")
    assert r.status_code == 200
    assert r.json() == {"handle": "alice", "display_name": "ALICE"}


def test_invite_handle_not_found(client):
    r = client.get("/invite/ghost")
    assert r.status_code == 404


def test_invite_handle_invalid_format(client):
    # '@' 等を弾く: 文字種チェック
    r = client.get("/invite/has%20space")
    assert r.status_code in (400, 404)
    r = client.get("/invite/ab")  # 短すぎる
    assert r.status_code == 400


# ---------- /referrals/redeem ----------

def test_redeem_happy_path(client):
    eng = client.engine
    referrer = _mk(eng, handle="ref")
    referee = _mk(eng, handle="kid")
    code = client.get("/me/referral", headers=_h(referrer)).json()["code"]

    r = client.post("/referrals/redeem", json={"code": code}, headers=_h(referee))
    assert r.status_code == 200
    assert r.json()["referrer_handle"] == "ref"

    with Session(eng) as s:
        rows = s.exec(__import__("sqlmodel").select(ReferralRedemption)).all()
        assert len(rows) == 1
        assert rows[0].referrer_id == referrer.id
        assert rows[0].referee_id == referee.id


def test_redeem_self_blocked(client):
    eng = client.engine
    me = _mk(eng, handle="me")
    code = client.get("/me/referral", headers=_h(me)).json()["code"]
    r = client.post("/referrals/redeem", json={"code": code}, headers=_h(me))
    assert r.status_code == 400


def test_redeem_unknown_code(client):
    eng = client.engine
    me = _mk(eng, handle="me")
    r = client.post("/referrals/redeem", json={"code": "nopecode"}, headers=_h(me))
    assert r.status_code == 404


def test_redeem_only_once(client):
    eng = client.engine
    a = _mk(eng, handle="a")
    b = _mk(eng, handle="b")
    c = _mk(eng, handle="c")
    code_a = client.get("/me/referral", headers=_h(a)).json()["code"]
    code_b = client.get("/me/referral", headers=_h(b)).json()["code"]
    assert client.post("/referrals/redeem", json={"code": code_a}, headers=_h(c)).status_code == 200
    # c が別コードを使おうとしても 409
    r = client.post("/referrals/redeem", json={"code": code_b}, headers=_h(c))
    assert r.status_code == 409


def test_redeem_invalid_format(client):
    eng = client.engine
    me = _mk(eng, handle="me")
    r = client.post("/referrals/redeem", json={"code": "ab"}, headers=_h(me))
    assert r.status_code == 400
    r = client.post("/referrals/redeem", json={"code": "!! injection"}, headers=_h(me))
    assert r.status_code == 400
