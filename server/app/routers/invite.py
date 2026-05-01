"""Phase 6: 招待リンク + 紹介プログラム。

- `GET /me/referral` 認証必須。自分の referral_code (なければ生成して保存) と招待リンクを返す
- `GET /invite/{handle}` 公開。LP / アプリ両方から叩ける handle 解決エンドポイント
- `POST /referrals/redeem` 認証必須。被紹介者が紹介コードを 1 回だけ登録できる

セキュリティ:
- referral_code は `secrets.token_urlsafe(6)` ベース (= URL safe 8 文字程度)。衝突したら再試行
- referee_id UNIQUE で 1 ユーザ 1 回まで
- 自分のコード使用は 400
- 存在しないコードは 404 (= 紹介者を特定できないので登録しない)
- code 文字列の入力は事前に長さ 4..32 で検証 (DoS 緩和)
"""

import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..models import ReferralRedemption, User
from ..security import get_current_user

router = APIRouter(tags=["invite"])

INVITE_BASE_URL = getattr(settings, "invite_base_url", None) or "https://okita.app"


# ---------- helpers ----------

_CODE_RE = re.compile(r"^[A-Za-z0-9_-]{4,32}$")


def _generate_unique_code(session: Session, max_attempts: int = 8) -> str:
    for _ in range(max_attempts):
        code = secrets.token_urlsafe(6)
        existing = session.exec(
            select(User).where(User.referral_code == code)
        ).first()
        if not existing:
            return code
    raise HTTPException(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "could not generate unique referral code",
    )


def _ensure_referral_code(session: Session, user: User) -> str:
    if user.referral_code:
        return user.referral_code
    code = _generate_unique_code(session)
    user.referral_code = code
    session.add(user)
    session.commit()
    session.refresh(user)
    return code


# ---------- schemas ----------

class ReferralOut(BaseModel):
    code: str
    invite_url: str
    handle_url: str


class InviteHandleOut(BaseModel):
    handle: str
    display_name: str


class RedeemIn(BaseModel):
    code: str


class RedeemOut(BaseModel):
    referrer_handle: str
    redeemed_at: str


# ---------- endpoints ----------

@router.get("/me/referral", response_model=ReferralOut)
def my_referral(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    code = _ensure_referral_code(session, current)
    return ReferralOut(
        code=code,
        invite_url=f"{INVITE_BASE_URL}/r/{code}",
        handle_url=f"{INVITE_BASE_URL}/invite/{current.handle}",
    )


@router.get("/invite/{handle}", response_model=InviteHandleOut)
def resolve_handle(
    handle: str,
    session: Session = Depends(get_session),
):
    """LP / アプリ両方から叩く公開エンドポイント。handle が存在すれば最低限の表示用情報を返す。"""
    if not re.match(r"^[A-Za-z0-9_]{3,20}$", handle):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid handle")
    u = session.exec(select(User).where(User.handle == handle)).first()
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "handle not found")
    return InviteHandleOut(handle=u.handle, display_name=u.display_name)


@router.post("/referrals/redeem", response_model=RedeemOut)
def redeem_referral(
    payload: RedeemIn,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    code = payload.code.strip()
    if not _CODE_RE.match(code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid code format")

    referrer = session.exec(
        select(User).where(User.referral_code == code)
    ).first()
    if not referrer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "code not found")
    if referrer.id == current.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot redeem your own code")

    existing = session.exec(
        select(ReferralRedemption).where(ReferralRedemption.referee_id == current.id)
    ).first()
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "you have already redeemed a referral code",
        )

    rec = ReferralRedemption(
        referrer_id=referrer.id,
        referee_id=current.id,
        code_used=code,
    )
    session.add(rec); session.commit(); session.refresh(rec)
    return RedeemOut(
        referrer_handle=referrer.handle,
        redeemed_at=rec.redeemed_at.isoformat(),
    )
