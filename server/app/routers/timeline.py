from datetime import date as date_cls, datetime, time
from typing import List

from fastapi import APIRouter, Depends
from sqlmodel import Session, or_, select

from ..db import get_session
from ..models import MuteDay, User, WakeStatus, WakeVisibility
from ..schemas import HomeStateOut, TimelineItem, UserOut, UserPublic
from ..scheduler import GRACE_MINUTES, today_target_minutes
from ..security import get_current_user

router = APIRouter(tags=["timeline"])


def _today_range() -> tuple[datetime, datetime]:
    today = date_cls.today()
    start = datetime.combine(today, time.min)
    end = datetime.combine(today, time.max)
    return start, end


@router.get("/home", response_model=HomeStateOut)
def home_state(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today_start, today_end = _today_range()
    today = date_cls.today()
    now = datetime.utcnow()
    now_minutes = now.hour * 60 + now.minute

    # 自分の今朝のタップ有無
    my_status_today = session.exec(
        select(WakeStatus).where(
            WakeStatus.user_id == current.id,
            WakeStatus.woke_at >= today_start,
            WakeStatus.woke_at <= today_end,
        )
    ).first()

    # 自分の今日休む状態
    my_blanket_mute = session.exec(
        select(MuteDay).where(
            MuteDay.owner_id == current.id,
            MuteDay.muted_date == today,
            MuteDay.viewer_id.is_(None),
        )
    ).first()

    # 自分が見える人 = 相手が私を viewer として公開している
    visible_rows = session.exec(
        select(WakeVisibility).where(WakeVisibility.viewer_id == current.id)
    ).all()
    owner_ids = [v.owner_id for v in visible_rows]

    timeline: List[TimelineItem] = []
    if owner_ids:
        owners = session.exec(select(User).where(User.id.in_(owner_ids))).all()
        statuses = session.exec(
            select(WakeStatus).where(
                WakeStatus.user_id.in_(owner_ids),
                WakeStatus.woke_at >= today_start,
                WakeStatus.woke_at <= today_end,
            )
        ).all()
        status_by_user = {s.user_id: s for s in statuses}

        mutes = session.exec(
            select(MuteDay).where(
                MuteDay.owner_id.in_(owner_ids),
                MuteDay.muted_date == today,
                or_(MuteDay.viewer_id.is_(None), MuteDay.viewer_id == current.id),
            )
        ).all()
        muted_owner_ids = {m.owner_id for m in mutes}

        for o in owners:
            muted = o.id in muted_owner_ids
            ws = status_by_user.get(o.id)
            target = today_target_minutes(o, now)
            woke_at = None if muted else (ws.woke_at if ws else None)
            is_overdue = (
                not muted
                and ws is None
                and target is not None
                and now_minutes >= target + GRACE_MINUTES
            )
            timeline.append(
                TimelineItem(
                    user=UserPublic.from_user(o),
                    woke_at=woke_at,
                    muted_today=muted,
                    today_target_minutes=target,
                    is_overdue=is_overdue,
                )
            )

    return HomeStateOut(
        me=UserOut.from_user(current),
        woke_today=my_status_today is not None,
        today_target_minutes=today_target_minutes(current, now),
        paused_today=my_blanket_mute is not None,
        timeline=timeline,
    )
