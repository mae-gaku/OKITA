import logging
from datetime import date as date_cls, datetime, time

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlmodel import Session, select

from .db import engine
from .models import (
    FAMILY_ROLE_PARENT,
    FamilyGroup,
    FamilyMember,
    MuteDay,
    User,
    WakeStatus,
    WakeVisibility,
)
from .push import send_push

logger = logging.getLogger("okita.scheduler")
scheduler = AsyncIOScheduler()

# 起床予定時刻からこの分数経過しても未起床なら通知
GRACE_MINUTES = 15
# さらに ESCALATE_GRACE_MINUTES 経過しても未起床なら、家族グループの parent にも通知
ESCALATE_GRACE_MINUTES = 30


_WEEKDAY_FIELDS = (
    "wake_min_mon",
    "wake_min_tue",
    "wake_min_wed",
    "wake_min_thu",
    "wake_min_fri",
    "wake_min_sat",
    "wake_min_sun",
)


def today_target_minutes(user: User, now: datetime | None = None) -> int | None:
    """今日(UTC)の起床予定時刻を返す。未設定なら None。"""
    n = now or datetime.utcnow()
    return getattr(user, _WEEKDAY_FIELDS[n.weekday()])


async def _check_missed_wakes() -> None:
    """各ユーザの起床予定 + GRACE 分を過ぎていて未起床なら、公開している全員に通知。"""
    now = datetime.utcnow()
    today = now.date()
    now_minutes = now.hour * 60 + now.minute
    today_start = datetime.combine(today, time.min)
    today_end = datetime.combine(today, time.max)

    with Session(engine) as session:
        users = session.exec(select(User)).all()
        for u in users:
            target = today_target_minutes(u, now)
            if target is None:
                continue
            if now_minutes < target + GRACE_MINUTES:
                continue
            if u.last_missed_notified_date == today:
                continue

            already = session.exec(
                select(WakeStatus).where(
                    WakeStatus.user_id == u.id,
                    WakeStatus.woke_at >= today_start,
                    WakeStatus.woke_at <= today_end,
                )
            ).first()
            if already:
                u.last_missed_notified_date = today
                session.add(u)
                continue

            blanket_mute = session.exec(
                select(MuteDay).where(
                    MuteDay.owner_id == u.id,
                    MuteDay.muted_date == today,
                    MuteDay.viewer_id.is_(None),
                )
            ).first()
            if blanket_mute:
                u.last_missed_notified_date = today
                session.add(u)
                continue

            viewers = session.exec(
                select(WakeVisibility).where(WakeVisibility.owner_id == u.id)
            ).all()
            individual_mutes = session.exec(
                select(MuteDay).where(
                    MuteDay.owner_id == u.id,
                    MuteDay.muted_date == today,
                    MuteDay.viewer_id.is_not(None),
                )
            ).all()
            muted_viewer_ids = {m.viewer_id for m in individual_mutes}
            target_viewer_ids = [
                v.viewer_id for v in viewers if v.viewer_id not in muted_viewer_ids
            ]
            if not target_viewer_ids:
                u.last_missed_notified_date = today
                session.add(u)
                continue

            viewer_users = session.exec(
                select(User).where(User.id.in_(target_viewer_ids))
            ).all()
            for v in viewer_users:
                if v.expo_push_token:
                    await send_push(
                        v.expo_push_token,
                        title="まだ起きていません",
                        body=f"{u.display_name}さんが起床予定時刻を過ぎてもタップしていません",
                        data={"type": "wake_missed", "user_id": u.id},
                    )

            u.last_missed_notified_date = today
            session.add(u)
        session.commit()


async def _check_family_escalations() -> None:
    """target + GRACE + ESCALATE_GRACE 経過でも未起床なら、所属家族の parent にも通知。

    既存の `_check_missed_wakes` とは独立したパスで、同日に 1 回だけ送る。
    parent 自身が overdue している場合の二重通知を避けるため、
    parent への通知は『当該 child のオーナーが child 役割の場合のみ』。
    """
    now = datetime.utcnow()
    today = now.date()
    now_minutes = now.hour * 60 + now.minute
    today_start = datetime.combine(today, time.min)
    today_end = datetime.combine(today, time.max)
    threshold = GRACE_MINUTES + ESCALATE_GRACE_MINUTES

    with Session(engine) as session:
        users = session.exec(select(User)).all()
        for u in users:
            target = today_target_minutes(u, now)
            if target is None:
                continue
            if now_minutes < target + threshold:
                continue
            if u.last_family_escalated_date == today:
                continue

            # 既に起きている → スキップ + dedup
            already = session.exec(
                select(WakeStatus).where(
                    WakeStatus.user_id == u.id,
                    WakeStatus.woke_at >= today_start,
                    WakeStatus.woke_at <= today_end,
                )
            ).first()
            if already:
                u.last_family_escalated_date = today
                session.add(u)
                continue

            # 「今日は休む」 → スキップ + dedup
            blanket_mute = session.exec(
                select(MuteDay).where(
                    MuteDay.owner_id == u.id,
                    MuteDay.muted_date == today,
                    MuteDay.viewer_id.is_(None),
                )
            ).first()
            if blanket_mute:
                u.last_family_escalated_date = today
                session.add(u)
                continue

            # u が child として属しているグループだけが対象
            child_memberships = session.exec(
                select(FamilyMember).where(
                    FamilyMember.user_id == u.id,
                    FamilyMember.role != FAMILY_ROLE_PARENT,
                )
            ).all()
            if not child_memberships:
                u.last_family_escalated_date = today
                session.add(u)
                continue

            group_ids = [m.group_id for m in child_memberships]
            parent_rows = session.exec(
                select(FamilyMember).where(
                    FamilyMember.group_id.in_(group_ids),
                    FamilyMember.role == FAMILY_ROLE_PARENT,
                )
            ).all()
            parent_ids = {p.user_id for p in parent_rows}
            if not parent_ids:
                u.last_family_escalated_date = today
                session.add(u)
                continue

            parents = session.exec(select(User).where(User.id.in_(parent_ids))).all()
            for p in parents:
                if p.expo_push_token:
                    await send_push(
                        p.expo_push_token,
                        title="家族の起床確認",
                        body=f"{u.display_name}さんが起床予定時刻を 30 分以上過ぎても未起床です",
                        data={"type": "family_escalation", "user_id": u.id},
                    )

            u.last_family_escalated_date = today
            session.add(u)
        session.commit()


def start() -> None:
    if scheduler.running:
        return
    scheduler.add_job(
        _check_missed_wakes,
        "interval",
        seconds=60,
        id="missed_wakes",
        replace_existing=True,
    )
    scheduler.add_job(
        _check_family_escalations,
        "interval",
        seconds=60,
        id="family_escalations",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started")


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


async def notify_self_tap(user_id: int, status_id: int) -> None:
    """ユーザがおはようをタップしたら、公開先 (非ミュート) にプッシュ。"""
    today = date_cls.today()
    with Session(engine) as session:
        owner: User | None = session.get(User, user_id)
        if not owner:
            return
        visibility = session.exec(
            select(WakeVisibility).where(WakeVisibility.owner_id == user_id)
        ).all()
        viewer_ids = [v.viewer_id for v in visibility]
        if not viewer_ids:
            return
        mutes = session.exec(
            select(MuteDay).where(
                MuteDay.owner_id == user_id, MuteDay.muted_date == today
            )
        ).all()
        all_muted = any(m.viewer_id is None for m in mutes)
        if all_muted:
            return
        muted_viewer_ids = {m.viewer_id for m in mutes if m.viewer_id is not None}
        targets = [vid for vid in viewer_ids if vid not in muted_viewer_ids]
        if not targets:
            return
        viewers = session.exec(select(User).where(User.id.in_(targets))).all()
    for v in viewers:
        if v.expo_push_token:
            await send_push(
                v.expo_push_token,
                title="おはよう ✓",
                body=f"{owner.display_name}さんが起床しました",
                data={"type": "wake_self", "user_id": user_id, "status_id": status_id},
            )
