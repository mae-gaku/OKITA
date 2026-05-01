"""未起床通知スケジューラの動作検証 (Phase 1)。

- target + 15 分経過していて未起床なら、公開先にプッシュ
- 同日 2 回目はスキップ (last_missed_notified_date による dedup)
- 既に起床していれば送らない
- 「今日は休む」(blanket mute) なら送らない
- 個別ミュートされた viewer には送らない
"""

from datetime import date, datetime, timedelta

import pytest
from sqlmodel import SQLModel, Session, create_engine

from app import scheduler as sched_mod
from app.models import MuteDay, User, WakeStatus, WakeVisibility


@pytest.fixture()
def session(monkeypatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(sched_mod, "engine", engine)
    with Session(engine) as s:
        yield s


@pytest.fixture()
def captured_push(monkeypatch):
    sent = []

    async def fake_send(token, title, body, data):
        sent.append({"token": token, "title": title, "body": body, "data": data})

    monkeypatch.setattr(sched_mod, "send_push", fake_send)
    return sent


def _seed_owner_and_viewers(session, *, target_minutes: int, viewer_count: int = 2):
    owner = User(
        email="o@x", handle="owner", display_name="Owner",
        wake_min_mon=target_minutes, wake_min_tue=target_minutes,
        wake_min_wed=target_minutes, wake_min_thu=target_minutes,
        wake_min_fri=target_minutes, wake_min_sat=target_minutes,
        wake_min_sun=target_minutes,
    )
    session.add(owner); session.flush()
    viewers = []
    for i in range(viewer_count):
        v = User(
            email=f"v{i}@x", handle=f"v{i}", display_name=f"V{i}",
            expo_push_token=f"ExponentPushToken[fake{i}]",
        )
        session.add(v); session.flush()
        session.add(WakeVisibility(owner_id=owner.id, viewer_id=v.id))
        viewers.append(v)
    session.commit()
    return owner, viewers


@pytest.mark.asyncio
async def test_sends_when_overdue_and_dedupes(session, captured_push, monkeypatch):
    """target+15分過ぎ + 未起床 → 公開先にプッシュ。2回目呼び出しはスキップ。"""
    now = datetime(2026, 5, 1, 7, 30)  # 07:30 UTC, Friday(weekday=4)
    target = 7 * 60  # 07:00 → grace 後 07:15、now=07:30 は overdue

    class FrozenDT(datetime):
        @classmethod
        def utcnow(cls):
            return now
    monkeypatch.setattr(sched_mod, "datetime", FrozenDT)

    _seed_owner_and_viewers(session, target_minutes=target, viewer_count=2)

    await sched_mod._check_missed_wakes()
    assert len(captured_push) == 2
    assert all("起きていません" in p["title"] for p in captured_push)

    # 2 回目は dedup で送られない
    captured_push.clear()
    await sched_mod._check_missed_wakes()
    assert captured_push == []


@pytest.mark.asyncio
async def test_within_grace_does_not_send(session, captured_push, monkeypatch):
    """target+15分以内ならまだ送らない。"""
    now = datetime(2026, 5, 1, 7, 10)  # target 07:00 + 10 分 → grace 内
    target = 7 * 60

    class FrozenDT(datetime):
        @classmethod
        def utcnow(cls):
            return now
    monkeypatch.setattr(sched_mod, "datetime", FrozenDT)

    _seed_owner_and_viewers(session, target_minutes=target)
    await sched_mod._check_missed_wakes()
    assert captured_push == []


@pytest.mark.asyncio
async def test_already_woke_skips(session, captured_push, monkeypatch):
    """その日に WakeStatus があれば送らない。"""
    now = datetime(2026, 5, 1, 7, 30)
    target = 7 * 60

    class FrozenDT(datetime):
        @classmethod
        def utcnow(cls):
            return now
    monkeypatch.setattr(sched_mod, "datetime", FrozenDT)

    owner, _ = _seed_owner_and_viewers(session, target_minutes=target)
    session.add(WakeStatus(user_id=owner.id, woke_at=now - timedelta(minutes=5)))
    session.commit()

    await sched_mod._check_missed_wakes()
    assert captured_push == []


@pytest.mark.asyncio
async def test_blanket_mute_skips(session, captured_push, monkeypatch):
    """その日に「今日は休む」が設定されていれば送らない。"""
    now = datetime(2026, 5, 1, 7, 30)
    target = 7 * 60

    class FrozenDT(datetime):
        @classmethod
        def utcnow(cls):
            return now
    monkeypatch.setattr(sched_mod, "datetime", FrozenDT)

    owner, _ = _seed_owner_and_viewers(session, target_minutes=target)
    session.add(MuteDay(owner_id=owner.id, viewer_id=None, muted_date=date(2026, 5, 1)))
    session.commit()

    await sched_mod._check_missed_wakes()
    assert captured_push == []


@pytest.mark.asyncio
async def test_individual_mute_filters_viewer(session, captured_push, monkeypatch):
    """個別ミュートされた viewer だけ除外され、残りには送られる。"""
    now = datetime(2026, 5, 1, 7, 30)
    target = 7 * 60

    class FrozenDT(datetime):
        @classmethod
        def utcnow(cls):
            return now
    monkeypatch.setattr(sched_mod, "datetime", FrozenDT)

    owner, viewers = _seed_owner_and_viewers(session, target_minutes=target, viewer_count=2)
    session.add(MuteDay(owner_id=owner.id, viewer_id=viewers[0].id, muted_date=date(2026, 5, 1)))
    session.commit()

    await sched_mod._check_missed_wakes()
    assert len(captured_push) == 1
    assert captured_push[0]["token"] == viewers[1].expo_push_token


@pytest.mark.asyncio
async def test_target_unset_skips(session, captured_push, monkeypatch):
    """その曜日の wake_min が None なら送らない。"""
    now = datetime(2026, 5, 1, 7, 30)  # Fri
    target = 7 * 60

    class FrozenDT(datetime):
        @classmethod
        def utcnow(cls):
            return now
    monkeypatch.setattr(sched_mod, "datetime", FrozenDT)

    owner, _ = _seed_owner_and_viewers(session, target_minutes=target)
    owner.wake_min_fri = None
    session.add(owner)
    session.commit()

    await sched_mod._check_missed_wakes()
    assert captured_push == []
