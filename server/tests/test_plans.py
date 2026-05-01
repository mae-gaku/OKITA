"""Phase 2: free / pro プランの enforcement。

free:
- visibility は 3 人まで (4 人目で 402)
- wake-times は 1 パターンのみ (異なる時刻が 2 種類以上で 402)
- wake-log は直近 7 日に from が自動クランプされる

pro:
- 上記制限なし
"""

from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import db as db_mod
from app import scheduler as sched_mod
from app.main import app
from app.db import get_session
from app.models import (
    Follow,
    User,
    WakeStatus,
)
from app.security import create_access_token, hash_password


@pytest.fixture()
def client(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(db_mod, "engine", engine)
    monkeypatch.setattr(sched_mod, "engine", engine)

    def _get_session():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = _get_session
    with TestClient(app) as c:
        c.engine = engine  # type: ignore[attr-defined]
        yield c
    app.dependency_overrides.clear()


def _mk_user(engine, *, handle: str, plan: str = "free") -> User:
    with Session(engine) as s:
        u = User(
            email=f"{handle}@example.com", handle=handle, display_name=handle.upper(),
            password_hash=hash_password("pw123456"), plan=plan,
        )
        s.add(u); s.commit(); s.refresh(u)
        return u


def _auth(user: User) -> dict:
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def _mutual_follow(engine, a: User, b: User) -> None:
    with Session(engine) as s:
        s.add(Follow(follower_id=a.id, followee_id=b.id))
        s.add(Follow(follower_id=b.id, followee_id=a.id))
        s.commit()


# ---------- visibility 3 人制限 ----------

def test_free_visibility_limit_blocks_4th(client):
    eng = client.engine
    me = _mk_user(eng, handle="me", plan="free")
    others = [_mk_user(eng, handle=f"u{i}") for i in range(4)]
    for o in others:
        _mutual_follow(eng, me, o)
    h = _auth(me)
    for o in others[:3]:
        r = client.post("/visibility", json={"viewer_id": o.id}, headers=h)
        assert r.status_code == 200, r.text
    r = client.post("/visibility", json={"viewer_id": others[3].id}, headers=h)
    assert r.status_code == 402
    assert "free plan" in r.json()["detail"]


def test_pro_visibility_unlimited(client):
    eng = client.engine
    me = _mk_user(eng, handle="me", plan="pro")
    others = [_mk_user(eng, handle=f"u{i}") for i in range(5)]
    for o in others:
        _mutual_follow(eng, me, o)
    h = _auth(me)
    for o in others:
        r = client.post("/visibility", json={"viewer_id": o.id}, headers=h)
        assert r.status_code == 200, r.text


# ---------- wake-times 1 パターン制限 ----------

def test_free_wake_times_single_pattern_ok(client):
    eng = client.engine
    me = _mk_user(eng, handle="me", plan="free")
    h = _auth(me)
    r = client.put("/me/wake-times", json={"minutes": [420] * 7}, headers=h)
    assert r.status_code == 200
    r = client.put("/me/wake-times", json={"minutes": [420, 420, None, 420, None, None, None]}, headers=h)
    assert r.status_code == 200


def test_free_wake_times_multi_pattern_blocked(client):
    eng = client.engine
    me = _mk_user(eng, handle="me", plan="free")
    h = _auth(me)
    r = client.put("/me/wake-times", json={"minutes": [420, 480, 420, 420, 420, 600, 600]}, headers=h)
    assert r.status_code == 402


def test_pro_wake_times_per_day_ok(client):
    eng = client.engine
    me = _mk_user(eng, handle="me", plan="pro")
    h = _auth(me)
    r = client.put("/me/wake-times", json={"minutes": [420, 480, 420, 420, 420, 600, 600]}, headers=h)
    assert r.status_code == 200


# ---------- wake-log 7 日 ----------

def test_free_wake_log_clamps_to_7_days(client):
    eng = client.engine
    me = _mk_user(eng, handle="me", plan="free")
    today = date.today()
    with Session(eng) as s:
        # 30 日前と 3 日前の 2 件
        s.add(WakeStatus(user_id=me.id,
                         woke_at=datetime.combine(today - timedelta(days=30), datetime.min.time())))
        s.add(WakeStatus(user_id=me.id,
                         woke_at=datetime.combine(today - timedelta(days=3), datetime.min.time())))
        s.commit()
    h = _auth(me)
    r = client.get(
        "/me/wake-log",
        params={"from": (today - timedelta(days=60)).isoformat(),
                "to": today.isoformat()},
        headers=h,
    )
    assert r.status_code == 200
    days = [row["date"] for row in r.json()]
    # 30 日前は 7 日窓の外なので返らない
    assert (today - timedelta(days=30)).isoformat() not in days
    assert (today - timedelta(days=3)).isoformat() in days


def test_pro_wake_log_no_clamp(client):
    eng = client.engine
    me = _mk_user(eng, handle="me", plan="pro")
    today = date.today()
    with Session(eng) as s:
        s.add(WakeStatus(user_id=me.id,
                         woke_at=datetime.combine(today - timedelta(days=30), datetime.min.time())))
        s.commit()
    h = _auth(me)
    r = client.get(
        "/me/wake-log",
        params={"from": (today - timedelta(days=60)).isoformat(),
                "to": today.isoformat()},
        headers=h,
    )
    assert r.status_code == 200
    days = [row["date"] for row in r.json()]
    assert (today - timedelta(days=30)).isoformat() in days


# ---------- /me/profile に plan が含まれる ----------

def test_profile_returns_plan(client):
    eng = client.engine
    me = _mk_user(eng, handle="me", plan="free")
    r = client.get("/me/profile", headers=_auth(me))
    assert r.status_code == 200
    assert r.json()["plan"] == "free"
