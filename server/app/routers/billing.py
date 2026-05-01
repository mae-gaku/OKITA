"""Phase 3a: 開発用の課金昇格エンドポイント。

セキュリティ方針:
- dev sandbox 昇格 (`POST /billing/dev-upgrade`) は `OKITA_ENV != production` のときだけ
  ルーティングに組み込まれる。production ビルドでは存在自体しない (404)。
- dev sandbox でも JWT 認証必須。匿名で誰でも昇格はできない。
- 本番レシート検証 (`POST /billing/verify`) のハンドラはハンドシェイクだけ受け、
  実装は Phase 3b (StoreKit2 + Apple JWS 検証) で差し替える。それまでは 501。
- `BillingReceipt.transaction_id` UNIQUE 制約により、同一レシートで別ユーザを昇格できない。
"""

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..models import ALLOWED_PLANS, BillingReceipt, PLAN_FREE, User
from ..security import get_current_user

router = APIRouter(prefix="/billing", tags=["billing"])


class VerifyIn(BaseModel):
    """StoreKit2 から渡される JWS。Phase 3b で実装。"""
    jws: str
    product_id: str


class BillingStatusOut(BaseModel):
    plan: str
    last_verified_at: Optional[datetime] = None
    last_source: Optional[str] = None


@router.get("/status", response_model=BillingStatusOut)
def get_billing_status(
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    last = session.exec(
        select(BillingReceipt)
        .where(BillingReceipt.user_id == current.id)
        .order_by(BillingReceipt.verified_at.desc())
    ).first()
    return BillingStatusOut(
        plan=current.plan,
        last_verified_at=last.verified_at if last else None,
        last_source=last.source if last else None,
    )


@router.post("/verify", response_model=BillingStatusOut)
def verify_receipt(
    payload: VerifyIn,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """本番経路。StoreKit2 JWS の Apple 検証は Phase 3b で実装。

    現状は誤って素通りしないよう 501 を返す。
    """
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "Apple receipt verification is not implemented yet (Phase 3b).",
    )


# ------------------------------------------------------------------
# dev sandbox: production では公開しない
# ------------------------------------------------------------------

class DevUpgradeIn(BaseModel):
    plan: Literal["pro", "family", "free"]


def _record_dev_receipt(session: Session, user: User, plan: str) -> BillingReceipt:
    tx_id = f"dev-{user.id}-{int(datetime.utcnow().timestamp() * 1000)}"
    rec = BillingReceipt(
        user_id=user.id,
        transaction_id=tx_id,
        product_id=f"dev.okita.{plan}",
        plan=plan,
        source="dev",
    )
    session.add(rec)
    return rec


if not settings.is_production:

    @router.post("/dev-upgrade", response_model=BillingStatusOut)
    def dev_upgrade(
        payload: DevUpgradeIn,
        current: User = Depends(get_current_user),
        session: Session = Depends(get_session),
    ):
        """開発用: 自分自身のプランを切り替える。production では存在しないルート。

        `free` を指定すれば dev 昇格を取り消せる (BillingReceipt は履歴として残す)。
        """
        if payload.plan not in ALLOWED_PLANS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid plan")

        current.plan = payload.plan
        session.add(current)

        rec: Optional[BillingReceipt] = None
        if payload.plan != PLAN_FREE:
            rec = _record_dev_receipt(session, current, payload.plan)

        session.commit()
        if rec is not None:
            session.refresh(rec)

        return BillingStatusOut(
            plan=current.plan,
            last_verified_at=rec.verified_at if rec else None,
            last_source=rec.source if rec else None,
        )
