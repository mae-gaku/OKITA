from datetime import date as date_cls
from typing import List

from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from ..db import get_session
from ..models import MuteDay, User
from ..schemas import MuteCreate, MuteOut
from ..security import get_current_user

router = APIRouter(prefix="/mute", tags=["mute"])


@router.get("/today", response_model=List[MuteOut])
def list_today_mutes(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today = date_cls.today()
    rows = session.exec(
        select(MuteDay).where(
            MuteDay.owner_id == current.id, MuteDay.muted_date == today
        )
    ).all()
    return [MuteOut(viewer_id=r.viewer_id, muted_date=r.muted_date) for r in rows]


@router.post("/today", response_model=MuteOut)
def mute_today(
    payload: MuteCreate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today = date_cls.today()
    existing = session.exec(
        select(MuteDay).where(
            MuteDay.owner_id == current.id,
            MuteDay.viewer_id == payload.viewer_id,
            MuteDay.muted_date == today,
        )
    ).first()
    if not existing:
        m = MuteDay(
            owner_id=current.id,
            viewer_id=payload.viewer_id,
            muted_date=today,
        )
        session.add(m)
        session.commit()
        session.refresh(m)
        return MuteOut(viewer_id=m.viewer_id, muted_date=m.muted_date)
    return MuteOut(viewer_id=existing.viewer_id, muted_date=existing.muted_date)


@router.delete("/today", status_code=status.HTTP_204_NO_CONTENT)
def unmute_today(
    viewer_id: int | None = None,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    today = date_cls.today()
    row = session.exec(
        select(MuteDay).where(
            MuteDay.owner_id == current.id,
            MuteDay.viewer_id == viewer_id,
            MuteDay.muted_date == today,
        )
    ).first()
    if row:
        session.delete(row)
        session.commit()
