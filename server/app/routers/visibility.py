from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, and_, or_, select

from ..db import get_session
from ..models import Follow, User, WakeVisibility
from ..plans import visibility_limit
from ..schemas import UserPublic, VisibilityAdd
from ..security import get_current_user

router = APIRouter(prefix="/visibility", tags=["visibility"])


def _is_mutual(session: Session, a_id: int, b_id: int) -> bool:
    rows = session.exec(
        select(Follow).where(
            or_(
                and_(Follow.follower_id == a_id, Follow.followee_id == b_id),
                and_(Follow.follower_id == b_id, Follow.followee_id == a_id),
            )
        )
    ).all()
    return len(rows) >= 2


@router.get("", response_model=List[UserPublic])
def list_visibility(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """List of users who are allowed to see my wake status."""
    rows = session.exec(
        select(WakeVisibility).where(WakeVisibility.owner_id == current.id)
    ).all()
    if not rows:
        return []
    viewer_ids = [r.viewer_id for r in rows]
    return session.exec(select(User).where(User.id.in_(viewer_ids))).all()


@router.post("", response_model=UserPublic)
def add_visibility(
    payload: VisibilityAdd,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if payload.viewer_id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot add yourself")
    target = session.get(User, payload.viewer_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if not _is_mutual(session, current.id, target.id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Mutual follow required to add to visibility list",
        )
    existing = session.exec(
        select(WakeVisibility).where(
            WakeVisibility.owner_id == current.id,
            WakeVisibility.viewer_id == target.id,
        )
    ).first()
    if not existing:
        limit = visibility_limit(current)
        if limit is not None:
            count = len(
                session.exec(
                    select(WakeVisibility).where(WakeVisibility.owner_id == current.id)
                ).all()
            )
            if count >= limit:
                raise HTTPException(
                    status.HTTP_402_PAYMENT_REQUIRED,
                    f"free plan allows up to {limit} viewers; upgrade to Pro to add more",
                )
        session.add(WakeVisibility(owner_id=current.id, viewer_id=target.id))
        session.commit()
    return target


@router.delete("/{viewer_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_visibility(
    viewer_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    row = session.exec(
        select(WakeVisibility).where(
            WakeVisibility.owner_id == current.id,
            WakeVisibility.viewer_id == viewer_id,
        )
    ).first()
    if row:
        session.delete(row)
        session.commit()
