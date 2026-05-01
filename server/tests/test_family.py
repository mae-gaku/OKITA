"""Phase 4: family グループ + 親による代理 visibility + エスカレーション通知。"""

from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import db as db_mod
from app import scheduler as sched_mod
from app.db import get_session
from app.main import app
from app.models import (
    FAMILY_MAX_MEMBERS,
    FamilyGroup,
    FamilyMember,
    MuteDay,
    User,
    WakeStatus,
    WakeVisibility,
)
from app.security import create_access_token, hash_password


# ---------- fixtures ----------

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


def _mk(eng, *, handle: str, plan: str = "free", token: str | None = None) -> User:
    with Session(eng) as s:
        u = User(
            email=f"{handle}@example.com", handle=handle, display_name=handle.upper(),
            password_hash=hash_password("pw123456"), plan=plan,
            expo_push_token=token,
        )
        s.add(u); s.commit(); s.refresh(u)
        return u


def _h(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(u.id)}"}


# ---------- グループ作成 / プラン制限 ----------

def test_only_family_plan_can_create_group(client):
    eng = client.engine
    free = _mk(eng, handle="free", plan="free")
    pro = _mk(eng, handle="pro", plan="pro")
    fam = _mk(eng, handle="fam", plan="family")

    assert client.post("/family", json={"name": "X"}, headers=_h(free)).status_code == 402
    assert client.post("/family", json={"name": "X"}, headers=_h(pro)).status_code == 402

    r = client.post("/family", json={"name": "Smith"}, headers=_h(fam))
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Smith"
    assert body["owner_id"] == fam.id
    assert len(body["members"]) == 1
    assert body["members"][0]["role"] == "parent"


# ---------- メンバー追加 / 上限 / 退出 ----------

def test_member_lifecycle_and_max(client):
    eng = client.engine
    parent = _mk(eng, handle="p", plan="family")
    r = client.post("/family", json={"name": "F"}, headers=_h(parent))
    gid = r.json()["id"]

    # max 6 (= parent + 5 children) まで OK、7 人目は 400
    for i in range(FAMILY_MAX_MEMBERS - 1):
        kid = _mk(eng, handle=f"k{i}")
        r = client.post(f"/family/{gid}/members", json={"handle": kid.handle}, headers=_h(parent))
        assert r.status_code == 200, r.text

    over = _mk(eng, handle="over")
    r = client.post(f"/family/{gid}/members", json={"handle": over.handle}, headers=_h(parent))
    assert r.status_code == 400
    assert "full" in r.json()["detail"]


def test_non_parent_cannot_add(client):
    eng = client.engine
    parent = _mk(eng, handle="p", plan="family")
    kid = _mk(eng, handle="k")
    other = _mk(eng, handle="o")
    gid = client.post("/family", json={"name": "F"}, headers=_h(parent)).json()["id"]
    client.post(f"/family/{gid}/members", json={"handle": kid.handle}, headers=_h(parent))

    r = client.post(f"/family/{gid}/members", json={"handle": other.handle}, headers=_h(kid))
    assert r.status_code == 403


def test_member_can_leave_self_but_owner_cannot(client):
    eng = client.engine
    parent = _mk(eng, handle="p", plan="family")
    kid = _mk(eng, handle="k")
    gid = client.post("/family", json={"name": "F"}, headers=_h(parent)).json()["id"]
    client.post(f"/family/{gid}/members", json={"handle": kid.handle}, headers=_h(parent))

    # 子が自分で抜ける → OK
    r = client.delete(f"/family/{gid}/members/{kid.id}", headers=_h(kid))
    assert r.status_code == 200

    # owner (= parent) が自分を抜けるのは不可 (グループ削除を要求)
    r = client.delete(f"/family/{gid}/members/{parent.id}", headers=_h(parent))
    assert r.status_code == 400


# ---------- 代理 visibility ----------

def test_parent_grant_visibility_makes_family_mutually_visible(client):
    eng = client.engine
    parent = _mk(eng, handle="p", plan="family")
    a = _mk(eng, handle="a")
    b = _mk(eng, handle="b")
    gid = client.post("/family", json={"name": "F"}, headers=_h(parent)).json()["id"]
    client.post(f"/family/{gid}/members", json={"handle": a.handle}, headers=_h(parent))
    client.post(f"/family/{gid}/members", json={"handle": b.handle}, headers=_h(parent))

    # a の visibility に他メンバー (parent, b) を一括付与
    r = client.post(
        f"/family/{gid}/visibility-grant",
        json={"target_user_id": a.id},
        headers=_h(parent),
    )
    assert r.status_code == 200
    with Session(eng) as s:
        rows = s.exec(
            __import__("sqlmodel").select(WakeVisibility).where(WakeVisibility.owner_id == a.id)
        ).all()
        viewer_ids = sorted(v.viewer_id for v in rows)
        assert viewer_ids == sorted([parent.id, b.id])

    # 二度叩いても重複しない
    r2 = client.post(
        f"/family/{gid}/visibility-grant",
        json={"target_user_id": a.id},
        headers=_h(parent),
    )
    assert r2.status_code == 200
    with Session(eng) as s:
        rows = s.exec(
            __import__("sqlmodel").select(WakeVisibility).where(WakeVisibility.owner_id == a.id)
        ).all()
        assert len(rows) == 2


def test_non_parent_cannot_grant(client):
    eng = client.engine
    parent = _mk(eng, handle="p", plan="family")
    kid = _mk(eng, handle="k")
    gid = client.post("/family", json={"name": "F"}, headers=_h(parent)).json()["id"]
    client.post(f"/family/{gid}/members", json={"handle": kid.handle}, headers=_h(parent))

    r = client.post(
        f"/family/{gid}/visibility-grant",
        json={"target_user_id": kid.id},
        headers=_h(kid),
    )
    assert r.status_code == 403


# ---------- エスカレーション (scheduler) ----------

@pytest.mark.asyncio
async def test_family_escalation_notifies_parent_after_45min(monkeypatch):
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(sched_mod, "engine", eng)

    sent = []

    async def fake_send(token, title, body, data):
        sent.append({"token": token, "title": title, "data": data})

    monkeypatch.setattr(sched_mod, "send_push", fake_send)

    target = 7 * 60
    now = datetime(2026, 5, 1, 7, 50)  # target+50 → 45 (= 15+30) を超えた

    class FrozenDT(datetime):
        @classmethod
        def utcnow(cls):
            return now
    monkeypatch.setattr(sched_mod, "datetime", FrozenDT)

    with Session(eng) as s:
        parent = User(
            email="p@example.com", handle="p", display_name="P",
            plan="family", expo_push_token="ExponentPushToken[parent]",
            wake_min_mon=None, wake_min_tue=None, wake_min_wed=None,
            wake_min_thu=None, wake_min_fri=None, wake_min_sat=None, wake_min_sun=None,
        )
        s.add(parent); s.flush()
        kid = User(
            email="k@example.com", handle="k", display_name="K", plan="free",
            wake_min_mon=target, wake_min_tue=target, wake_min_wed=target,
            wake_min_thu=target, wake_min_fri=target, wake_min_sat=target, wake_min_sun=target,
        )
        s.add(kid); s.flush()
        g = FamilyGroup(name="F", owner_id=parent.id)
        s.add(g); s.flush()
        s.add(FamilyMember(group_id=g.id, user_id=parent.id, role="parent"))
        s.add(FamilyMember(group_id=g.id, user_id=kid.id, role="child"))
        s.commit()

    await sched_mod._check_family_escalations()
    assert len(sent) == 1
    assert sent[0]["token"] == "ExponentPushToken[parent]"
    assert sent[0]["data"]["type"] == "family_escalation"

    # dedup
    sent.clear()
    await sched_mod._check_family_escalations()
    assert sent == []


@pytest.mark.asyncio
async def test_family_escalation_not_yet_within_45min(monkeypatch):
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(sched_mod, "engine", eng)

    sent = []
    async def fake_send(token, title, body, data):
        sent.append(token)
    monkeypatch.setattr(sched_mod, "send_push", fake_send)

    target = 7 * 60
    now = datetime(2026, 5, 1, 7, 30)  # target+30 < 45 なのでまだ送らない

    class FrozenDT(datetime):
        @classmethod
        def utcnow(cls):
            return now
    monkeypatch.setattr(sched_mod, "datetime", FrozenDT)

    with Session(eng) as s:
        parent = User(
            email="p@example.com", handle="p", display_name="P",
            plan="family", expo_push_token="parent",
        )
        s.add(parent); s.flush()
        kid = User(
            email="k@example.com", handle="k", display_name="K",
            wake_min_mon=target, wake_min_tue=target, wake_min_wed=target,
            wake_min_thu=target, wake_min_fri=target, wake_min_sat=target, wake_min_sun=target,
        )
        s.add(kid); s.flush()
        g = FamilyGroup(name="F", owner_id=parent.id)
        s.add(g); s.flush()
        s.add(FamilyMember(group_id=g.id, user_id=parent.id, role="parent"))
        s.add(FamilyMember(group_id=g.id, user_id=kid.id, role="child"))
        s.commit()

    await sched_mod._check_family_escalations()
    assert sent == []


@pytest.mark.asyncio
async def test_family_escalation_skipped_when_kid_already_woke(monkeypatch):
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(eng)
    monkeypatch.setattr(sched_mod, "engine", eng)

    sent = []
    async def fake_send(token, title, body, data):
        sent.append(token)
    monkeypatch.setattr(sched_mod, "send_push", fake_send)

    target = 7 * 60
    now = datetime(2026, 5, 1, 7, 50)

    class FrozenDT(datetime):
        @classmethod
        def utcnow(cls):
            return now
    monkeypatch.setattr(sched_mod, "datetime", FrozenDT)

    with Session(eng) as s:
        parent = User(
            email="p@example.com", handle="p", display_name="P",
            plan="family", expo_push_token="parent",
        )
        s.add(parent); s.flush()
        kid = User(
            email="k@example.com", handle="k", display_name="K",
            wake_min_mon=target, wake_min_tue=target, wake_min_wed=target,
            wake_min_thu=target, wake_min_fri=target, wake_min_sat=target, wake_min_sun=target,
        )
        s.add(kid); s.flush()
        s.add(WakeStatus(user_id=kid.id, woke_at=now - timedelta(minutes=10)))
        g = FamilyGroup(name="F", owner_id=parent.id)
        s.add(g); s.flush()
        s.add(FamilyMember(group_id=g.id, user_id=parent.id, role="parent"))
        s.add(FamilyMember(group_id=g.id, user_id=kid.id, role="child"))
        s.commit()

    await sched_mod._check_family_escalations()
    assert sent == []
