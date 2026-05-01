from datetime import date, datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from .models import User


WEEKDAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _wake_minutes_from_user(user: User) -> List[Optional[int]]:
    return [getattr(user, f"wake_min_{k}") for k in WEEKDAY_KEYS]


def _coerce_user_like(data: Any) -> Any:
    """User ORM が来たら wake_minutes を組み立てた dict に変換。"""
    if isinstance(data, User):
        return {
            "id": data.id,
            "email": data.email,
            "handle": data.handle,
            "display_name": data.display_name,
            "wake_minutes": _wake_minutes_from_user(data),
            "plan": data.plan,
        }
    return data


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    display_name: str = Field(min_length=1, max_length=40)
    handle: str = Field(min_length=3, max_length=20, pattern="^[a-zA-Z0-9_]+$")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    handle: str
    display_name: str
    plan: str = "free"
    wake_minutes: List[Optional[int]] = Field(
        default_factory=lambda: [None] * 7,
        description="UTC 分単位の曜日別起床予定時刻 [Mon..Sun]",
    )

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, data: Any) -> Any:
        return _coerce_user_like(data)

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        return cls.model_validate(user)


class UserPublic(BaseModel):
    """他ユーザに見せる情報。email は含めない。"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    handle: str
    display_name: str
    wake_minutes: List[Optional[int]] = Field(default_factory=lambda: [None] * 7)

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, data: Any) -> Any:
        return _coerce_user_like(data)

    @classmethod
    def from_user(cls, user: User) -> "UserPublic":
        return cls.model_validate(user)


class ProfileUpdate(BaseModel):
    """display_name のみ。起床時刻は PUT /me/wake-times で変更する。"""
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=40)


class WakeTimesIn(BaseModel):
    """曜日別起床予定時刻。長さ 7 の配列で Mon..Sun の順。各要素は 0..1439 もしくは null。"""
    minutes: List[Optional[int]]

    @model_validator(mode="after")
    def _validate(self) -> "WakeTimesIn":
        if len(self.minutes) != 7:
            raise ValueError("minutes must have length 7 (Mon..Sun)")
        for m in self.minutes:
            if m is None:
                continue
            if not isinstance(m, int) or m < 0 or m > 1439:
                raise ValueError("each minute must be int in [0, 1439] or null")
        return self


class WakeTimesOut(BaseModel):
    minutes: List[Optional[int]]

    @classmethod
    def from_user(cls, user: User) -> "WakeTimesOut":
        return cls(minutes=_wake_minutes_from_user(user))


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PushTokenIn(BaseModel):
    expo_push_token: str


# ---- Follow ----

class FollowCreate(BaseModel):
    handle: Optional[str] = None
    user_id: Optional[int] = None


class FollowEdge(BaseModel):
    """関係性の表示用。"""
    user: UserPublic
    i_follow: bool
    follows_me: bool
    in_my_visibility: bool   # 私が公開している (= 相手は私を見られる)
    in_their_visibility: bool  # 相手が私に公開している (= 私は相手を見られる)


# ---- Visibility ----

class VisibilityAdd(BaseModel):
    viewer_id: int


# ---- Mute ----

class MuteCreate(BaseModel):
    viewer_id: Optional[int] = None  # None = 全員 (今日は休む)


class MuteOut(BaseModel):
    viewer_id: Optional[int]
    muted_date: date


# ---- Wake / Timeline ----

class TimelineItem(BaseModel):
    user: UserPublic
    woke_at: Optional[datetime]   # 今朝の起床時刻。null = まだ。
    muted_today: bool             # 相手が「今日は休む」をしている
    today_target_minutes: Optional[int]  # 相手の今日の起床予定 (UTC min)。null = 未設定
    is_overdue: bool              # 今日の起床予定 + 15min を過ぎても未起床


class HomeStateOut(BaseModel):
    me: UserOut
    woke_today: bool
    today_target_minutes: Optional[int]   # 自分の今日の起床予定
    paused_today: bool                    # 自分が「今日は休む」中
    timeline: List[TimelineItem]
