from datetime import date as date_cls, datetime, time, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import User, WakeStatus
from ..plans import wake_log_window_start, wake_minutes_within_free, is_paid
from ..schemas import (
    WEEKDAY_KEYS,
    ProfileUpdate,
    UserOut,
    WakeTimesIn,
    WakeTimesOut,
)
from ..security import get_current_user

router = APIRouter(prefix="/me", tags=["me"])


class StreakOut(BaseModel):
    current: int
    longest: int
    total_wakes: int
    woke_today: bool


class WakeLogDay(BaseModel):
    date: date_cls
    woke_at: datetime
    source: str


def _wake_dates(session: Session, user_id: int) -> set[date_cls]:
    rows = session.exec(
        select(WakeStatus.woke_at).where(WakeStatus.user_id == user_id)
    ).all()
    return {w.date() for w in rows}


def _streaks(dates: set[date_cls], today: date_cls) -> tuple[int, int]:
    if not dates:
        return 0, 0
    longest = 1
    cur_run = 1
    sorted_dates = sorted(dates)
    for prev, curr in zip(sorted_dates, sorted_dates[1:]):
        if (curr - prev).days == 1:
            cur_run += 1
            longest = max(longest, cur_run)
        else:
            cur_run = 1

    anchor = today if today in dates else today - timedelta(days=1)
    if anchor not in dates:
        return 0, longest
    current = 0
    d = anchor
    while d in dates:
        current += 1
        d -= timedelta(days=1)
    return current, longest


@router.get("/profile", response_model=UserOut)
def get_profile(current: User = Depends(get_current_user)):
    return UserOut.from_user(current)


@router.patch("/profile", response_model=UserOut)
def update_profile(
    payload: ProfileUpdate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if payload.display_name is not None:
        current.display_name = payload.display_name
    session.add(current)
    session.commit()
    session.refresh(current)
    return UserOut.from_user(current)


@router.get("/wake-times", response_model=WakeTimesOut)
def get_wake_times(current: User = Depends(get_current_user)):
    return WakeTimesOut.from_user(current)


@router.put("/wake-times", response_model=WakeTimesOut)
def set_wake_times(
    payload: WakeTimesIn,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not is_paid(current) and not wake_minutes_within_free(payload.minutes):
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "free plan allows only one wake time across all days; upgrade to Pro for per-day schedules",
        )
    for key, m in zip(WEEKDAY_KEYS, payload.minutes):
        setattr(current, f"wake_min_{key}", m)
    # 設定変更時は今日の通知抑止フラグを解除
    current.last_missed_notified_date = None
    session.add(current)
    session.commit()
    session.refresh(current)
    return WakeTimesOut.from_user(current)


@router.get("/streak", response_model=StreakOut)
def my_streak(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    dates = _wake_dates(session, current.id)
    today = date_cls.today()
    cur, longest = _streaks(dates, today)
    return StreakOut(
        current=cur,
        longest=longest,
        total_wakes=len(dates),
        woke_today=today in dates,
    )


@router.get("/wake-log", response_model=List[WakeLogDay])
def my_wake_log(
    from_date: date_cls = Query(alias="from"),
    to_date: date_cls = Query(alias="to"),
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    earliest = wake_log_window_start(current, date_cls.today())
    if earliest is not None and from_date < earliest:
        from_date = earliest
    if from_date > to_date:
        return []
    start = datetime.combine(from_date, time.min)
    end = datetime.combine(to_date, time.max)
    rows = session.exec(
        select(WakeStatus)
        .where(
            WakeStatus.user_id == current.id,
            WakeStatus.woke_at >= start,
            WakeStatus.woke_at <= end,
        )
        .order_by(WakeStatus.woke_at)
    ).all()
    seen: dict[date_cls, WakeStatus] = {}
    for r in rows:
        d = r.woke_at.date()
        if d not in seen:
            seen[d] = r
    return [
        WakeLogDay(date=d, woke_at=s.woke_at, source=s.source)
        for d, s in sorted(seen.items())
    ]
