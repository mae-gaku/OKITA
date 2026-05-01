from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel, UniqueConstraint


PLAN_FREE = "free"
PLAN_PRO = "pro"
PLAN_FAMILY = "family"
ALLOWED_PLANS = (PLAN_FREE, PLAN_PRO, PLAN_FAMILY)

FAMILY_ROLE_PARENT = "parent"
FAMILY_ROLE_CHILD = "child"
FAMILY_ROLES = (FAMILY_ROLE_PARENT, FAMILY_ROLE_CHILD)
FAMILY_MAX_MEMBERS = 6


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    handle: str = Field(index=True, unique=True)
    display_name: str
    password_hash: Optional[str] = None
    apple_sub: Optional[str] = Field(default=None, index=True, unique=True)
    expo_push_token: Optional[str] = None
    plan: str = Field(default=PLAN_FREE)

    # 起床予定時刻 (UTC minute-of-day, 0..1439). 曜日別。null = その曜日は未設定。
    # weekday は Python の Monday=0 .. Sunday=6 と一致。
    wake_min_mon: Optional[int] = None
    wake_min_tue: Optional[int] = None
    wake_min_wed: Optional[int] = None
    wake_min_thu: Optional[int] = None
    wake_min_fri: Optional[int] = None
    wake_min_sat: Optional[int] = None
    wake_min_sun: Optional[int] = None

    # 未起床通知の二重送信防止
    last_missed_notified_date: Optional[date] = None
    # 家族エスカレーション通知の二重送信防止
    last_family_escalated_date: Optional[date] = None

    # 招待・紹介
    referral_code: Optional[str] = Field(default=None, index=True, unique=True)

    created_at: datetime = Field(default_factory=datetime.utcnow)


class Follow(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("follower_id", "followee_id", name="uq_follow"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    follower_id: int = Field(foreign_key="user.id", index=True)
    followee_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class WakeVisibility(SQLModel, table=True):
    """owner が viewer に対して、自分の起床状態を公開していることを表す。"""

    __table_args__ = (
        UniqueConstraint("owner_id", "viewer_id", name="uq_visibility"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    viewer_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class WakeStatus(SQLModel, table=True):
    """ユーザがその日「起きた」記録。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    woke_at: datetime = Field(index=True)
    source: str = "self"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BillingReceipt(SQLModel, table=True):
    """課金レシート (StoreKit2 JWS or dev sandbox)。

    transaction_id は Apple 側で一意なので、別アカウントへの再利用を弾く。
    source は `apple` (本物の StoreKit2) か `dev` (Phase 3a の sandbox 昇格)。
    """

    __table_args__ = (
        UniqueConstraint("transaction_id", name="uq_billing_tx"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    transaction_id: str = Field(index=True)
    product_id: str
    plan: str  # "pro" | "family"
    source: str  # "apple" | "dev"
    verified_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None  # None = 買い切り or 未取得


class FamilyGroup(SQLModel, table=True):
    """家族グループ。owner (親) が family プランで作る。最大 6 人。"""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FamilyMember(SQLModel, table=True):
    __table_args__ = (
        UniqueConstraint("group_id", "user_id", name="uq_family_member"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: int = Field(foreign_key="familygroup.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    role: str = Field(default=FAMILY_ROLE_CHILD)  # "parent" | "child"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ReferralRedemption(SQLModel, table=True):
    """紹介コードの使用記録。

    referee_id (使った側) は UNIQUE。1 ユーザは 1 回しか紹介コードを使えない。
    実際の Pro 1ヶ月無料付与は Phase 3b の課金実装側で参照する想定。
    """

    __table_args__ = (
        UniqueConstraint("referee_id", name="uq_referral_referee"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    referrer_id: int = Field(foreign_key="user.id", index=True)
    referee_id: int = Field(foreign_key="user.id", index=True)
    code_used: str
    redeemed_at: datetime = Field(default_factory=datetime.utcnow)


class MuteDay(SQLModel, table=True):
    """当日のみ通知停止。viewer_id NULL = 全員に対して停止 (= 「今日は休む」)。"""

    __table_args__ = (
        UniqueConstraint("owner_id", "viewer_id", "muted_date", name="uq_mute"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    viewer_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    muted_date: date = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
