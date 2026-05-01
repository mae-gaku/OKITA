from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, and_, or_, select

from ..db import get_session
from ..models import Follow, User, WakeVisibility
from ..schemas import FollowCreate, FollowEdge, UserPublic
from ..security import get_current_user

router = APIRouter(prefix="/follows", tags=["follows"])


def _edge(
    other: User,
    current_id: int,
    follows: list[Follow],
    visibilities: list[WakeVisibility],
) -> FollowEdge:
    i_follow = any(f.follower_id == current_id and f.followee_id == other.id for f in follows)
    follows_me = any(f.follower_id == other.id and f.followee_id == current_id for f in follows)
    in_my_visibility = any(
        v.owner_id == current_id and v.viewer_id == other.id for v in visibilities
    )
    in_their_visibility = any(
        v.owner_id == other.id and v.viewer_id == current_id for v in visibilities
    )
    return FollowEdge(
        user=UserPublic.from_user(other),
        i_follow=i_follow,
        follows_me=follows_me,
        in_my_visibility=in_my_visibility,
        in_their_visibility=in_their_visibility,
    )


@router.post("", response_model=FollowEdge)
def follow_user(
    payload: FollowCreate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    target: User | None = None
    if payload.user_id is not None:
        target = session.get(User, payload.user_id)
    elif payload.handle:
        target = session.exec(
            select(User).where(User.handle == payload.handle.lower().lstrip("@"))
        ).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot follow yourself")

    existing = session.exec(
        select(Follow).where(
            Follow.follower_id == current.id, Follow.followee_id == target.id
        )
    ).first()
    if not existing:
        session.add(Follow(follower_id=current.id, followee_id=target.id))
        session.commit()

    follows = session.exec(
        select(Follow).where(
            or_(
                and_(Follow.follower_id == current.id, Follow.followee_id == target.id),
                and_(Follow.follower_id == target.id, Follow.followee_id == current.id),
            )
        )
    ).all()
    visibilities = session.exec(
        select(WakeVisibility).where(
            or_(
                and_(WakeVisibility.owner_id == current.id, WakeVisibility.viewer_id == target.id),
                and_(WakeVisibility.owner_id == target.id, WakeVisibility.viewer_id == current.id),
            )
        )
    ).all()
    return _edge(target, current.id, list(follows), list(visibilities))


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def unfollow(
    user_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    f = session.exec(
        select(Follow).where(
            Follow.follower_id == current.id, Follow.followee_id == user_id
        )
    ).first()
    if f:
        session.delete(f)
    # Also drop visibility if I had granted them
    v = session.exec(
        select(WakeVisibility).where(
            WakeVisibility.owner_id == current.id, WakeVisibility.viewer_id == user_id
        )
    ).first()
    if v:
        session.delete(v)
    session.commit()


@router.get("", response_model=List[FollowEdge])
def list_follows(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """All people I follow OR who follow me, with relationship details."""
    follow_rows = session.exec(
        select(Follow).where(
            or_(Follow.follower_id == current.id, Follow.followee_id == current.id)
        )
    ).all()
    user_ids = set()
    for f in follow_rows:
        if f.follower_id == current.id:
            user_ids.add(f.followee_id)
        else:
            user_ids.add(f.follower_id)
    if not user_ids:
        return []
    others = session.exec(select(User).where(User.id.in_(user_ids))).all()
    visibilities = session.exec(
        select(WakeVisibility).where(
            or_(
                WakeVisibility.owner_id == current.id,
                WakeVisibility.viewer_id == current.id,
            )
        )
    ).all()
    return [_edge(o, current.id, list(follow_rows), list(visibilities)) for o in others]
