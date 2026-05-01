from typing import List

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, or_, select

from ..db import get_session
from ..models import User
from ..schemas import UserPublic
from ..security import get_current_user

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search", response_model=List[UserPublic])
def search_users(
    q: str = Query(min_length=1, max_length=40),
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    needle = q.strip().lstrip("@").lower()
    if not needle:
        return []
    pattern = f"%{needle}%"
    stmt = (
        select(User)
        .where(User.id != current.id)
        .where(or_(User.handle.like(pattern), User.display_name.like(f"%{q.strip()}%")))
        .limit(20)
    )
    return session.exec(stmt).all()
