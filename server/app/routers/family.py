"""家族グループ (Phase 4)。

- family プランの owner だけがグループを作れる
- 1 グループ最大 6 人 (FAMILY_MAX_MEMBERS)
- parent: メンバー追加 / 削除 / 子の公開リスト代理設定
- child / その他のメンバー: 自分のグループ確認 / 自分で抜ける
- 公開リスト代理設定: 同じグループ内で互いに見えるよう WakeVisibility を一括追加
  (相互フォロー要件は family グループ内では緩める = 暗黙の信頼)
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import (
    FAMILY_MAX_MEMBERS,
    FAMILY_ROLE_CHILD,
    FAMILY_ROLE_PARENT,
    FAMILY_ROLES,
    FamilyGroup,
    FamilyMember,
    PLAN_FAMILY,
    User,
    WakeVisibility,
)
from ..schemas import UserPublic
from ..security import get_current_user

router = APIRouter(prefix="/family", tags=["family"])


# ---------- I/O schemas ----------

class FamilyCreate(BaseModel):
    name: str


class FamilyMemberAdd(BaseModel):
    handle: str
    role: str = FAMILY_ROLE_CHILD


class FamilyMemberOut(BaseModel):
    user: UserPublic
    role: str


class FamilyOut(BaseModel):
    id: int
    name: str
    owner_id: int
    members: List[FamilyMemberOut]


# ---------- helpers ----------

def _load_group_or_404(session: Session, group_id: int) -> FamilyGroup:
    g = session.get(FamilyGroup, group_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "family group not found")
    return g


def _members(session: Session, group_id: int) -> list[FamilyMember]:
    return session.exec(
        select(FamilyMember).where(FamilyMember.group_id == group_id)
    ).all()


def _member_for(session: Session, group_id: int, user_id: int) -> Optional[FamilyMember]:
    return session.exec(
        select(FamilyMember).where(
            FamilyMember.group_id == group_id,
            FamilyMember.user_id == user_id,
        )
    ).first()


def _to_out(session: Session, group: FamilyGroup) -> FamilyOut:
    members = _members(session, group.id)
    user_ids = [m.user_id for m in members]
    users = (
        session.exec(select(User).where(User.id.in_(user_ids))).all()
        if user_ids
        else []
    )
    by_id = {u.id: u for u in users}
    return FamilyOut(
        id=group.id,
        name=group.name,
        owner_id=group.owner_id,
        members=[
            FamilyMemberOut(user=UserPublic.from_user(by_id[m.user_id]), role=m.role)
            for m in members
            if m.user_id in by_id
        ],
    )


def _ensure_in_group(session: Session, group: FamilyGroup, user: User) -> FamilyMember:
    me = _member_for(session, group.id, user.id)
    if not me:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not a member of this group")
    return me


def _ensure_parent(session: Session, group: FamilyGroup, user: User) -> FamilyMember:
    me = _ensure_in_group(session, group, user)
    if me.role != FAMILY_ROLE_PARENT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "parent role required")
    return me


# ---------- endpoints ----------

@router.post("", response_model=FamilyOut, status_code=status.HTTP_201_CREATED)
def create_family(
    payload: FamilyCreate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current.plan != PLAN_FAMILY:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "creating a family group requires the Family plan",
        )
    name = payload.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "name is required")
    g = FamilyGroup(name=name, owner_id=current.id)
    session.add(g); session.flush()
    session.add(FamilyMember(group_id=g.id, user_id=current.id, role=FAMILY_ROLE_PARENT))
    session.commit()
    session.refresh(g)
    return _to_out(session, g)


@router.get("", response_model=List[FamilyOut])
def list_my_families(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    rows = session.exec(
        select(FamilyMember).where(FamilyMember.user_id == current.id)
    ).all()
    if not rows:
        return []
    group_ids = [r.group_id for r in rows]
    groups = session.exec(select(FamilyGroup).where(FamilyGroup.id.in_(group_ids))).all()
    return [_to_out(session, g) for g in groups]


@router.get("/{group_id}", response_model=FamilyOut)
def get_family(
    group_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    g = _load_group_or_404(session, group_id)
    _ensure_in_group(session, g, current)
    return _to_out(session, g)


@router.post("/{group_id}/members", response_model=FamilyOut)
def add_member(
    group_id: int,
    payload: FamilyMemberAdd,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    g = _load_group_or_404(session, group_id)
    _ensure_parent(session, g, current)

    role = payload.role
    if role not in FAMILY_ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid role")

    target = session.exec(select(User).where(User.handle == payload.handle)).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")

    if _member_for(session, g.id, target.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "already a member")

    if len(_members(session, g.id)) >= FAMILY_MAX_MEMBERS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"family group is full (max {FAMILY_MAX_MEMBERS})",
        )

    session.add(FamilyMember(group_id=g.id, user_id=target.id, role=role))
    session.commit()
    return _to_out(session, g)


@router.delete("/{group_id}/members/{user_id}", response_model=FamilyOut)
def remove_member(
    group_id: int,
    user_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    g = _load_group_or_404(session, group_id)
    me = _ensure_in_group(session, g, current)

    # 親なら任意のメンバーを外せる。本人なら自分を外せる。それ以外は不可。
    if me.role != FAMILY_ROLE_PARENT and user_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only parents can remove others")
    # 親 (= owner) は自分を外せない (グループが孤児化するため)
    if user_id == g.owner_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "owner cannot leave; delete the group instead",
        )

    target = _member_for(session, g.id, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "member not found")
    session.delete(target)
    session.commit()
    return _to_out(session, g)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_family(
    group_id: int,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    g = _load_group_or_404(session, group_id)
    if g.owner_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the owner can delete the group")
    for m in _members(session, g.id):
        session.delete(m)
    session.delete(g)
    session.commit()


class VisibilityGrantIn(BaseModel):
    """親による子の公開リスト代理設定。

    対象 (target_user_id) の visibility に、家族グループ内の他メンバー全員を一括追加。
    既に存在するエッジは無視。
    """
    target_user_id: int


@router.post("/{group_id}/visibility-grant", response_model=FamilyOut)
def grant_family_visibility(
    group_id: int,
    payload: VisibilityGrantIn,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    g = _load_group_or_404(session, group_id)
    _ensure_parent(session, g, current)

    members = _members(session, g.id)
    member_ids = {m.user_id for m in members}
    if payload.target_user_id not in member_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "target is not in this group")

    other_ids = [uid for uid in member_ids if uid != payload.target_user_id]
    existing = session.exec(
        select(WakeVisibility).where(WakeVisibility.owner_id == payload.target_user_id)
    ).all()
    existing_viewers = {v.viewer_id for v in existing}
    for vid in other_ids:
        if vid in existing_viewers:
            continue
        session.add(WakeVisibility(owner_id=payload.target_user_id, viewer_id=vid))
    session.commit()
    return _to_out(session, g)
