"""Plan enforcement (Phase 2 足場)。

無料プランの制限:
- 公開リスト (visibility) は最大 3 人
- 起床予定時刻は「1 パターン」(全曜日で同じ時刻 1 種類のみ)
- 起床ログは直近 7 日間まで遡れる
"""

from datetime import date, timedelta
from typing import Iterable, Optional

from .models import PLAN_FAMILY, PLAN_FREE, PLAN_PRO, User


FREE_VISIBILITY_LIMIT = 3
FREE_WAKE_LOG_DAYS = 7


def is_paid(user: User) -> bool:
    return user.plan in (PLAN_PRO, PLAN_FAMILY)


def visibility_limit(user: User) -> Optional[int]:
    return None if is_paid(user) else FREE_VISIBILITY_LIMIT


def wake_log_window_start(user: User, today: date) -> Optional[date]:
    """free のとき、wake-log で参照可能な最も古い日付。pro/family は None (無制限)。"""
    if is_paid(user):
        return None
    return today - timedelta(days=FREE_WAKE_LOG_DAYS - 1)


def wake_minutes_within_free(minutes: Iterable[Optional[int]]) -> bool:
    """free プラン許容範囲かチェック。non-null のユニーク値が 1 種類以下なら OK。"""
    uniq = {m for m in minutes if m is not None}
    return len(uniq) <= 1
