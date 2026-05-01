from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from ..db import get_session
from ..models import User, WakeStatus
from ..scheduler import notify_self_tap
from ..security import get_current_user

router = APIRouter(prefix="/wakes", tags=["wakes"])


class SelfTapIn(BaseModel):
    woke_at: Optional[datetime] = None  # 省略時はサーバ now (UTC)


@router.post("/me/up", status_code=status.HTTP_201_CREATED)
async def self_tap(
    payload: SelfTapIn = SelfTapIn(),
    background: BackgroundTasks = None,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """自己申告で「起きた」を記録。公開先 (非ミュート) にプッシュ。
    `woke_at` を省略するとサーバ現在時刻。指定する場合は過去 24h 以内・未来不可。"""
    now = datetime.utcnow()
    woke_at = payload.woke_at
    if woke_at is not None:
        if woke_at.tzinfo is not None:
            woke_at = woke_at.astimezone(tz=None).replace(tzinfo=None)
        if woke_at > now + timedelta(minutes=2):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot set a future time")
        if woke_at < now - timedelta(hours=24):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot set a time older than 24h")
    else:
        woke_at = now
    ws = WakeStatus(user_id=current.id, woke_at=woke_at, source="self")
    session.add(ws)
    session.commit()
    session.refresh(ws)
    if background is not None:
        background.add_task(notify_self_tap, current.id, ws.id)
    return {"id": ws.id, "woke_at": ws.woke_at}
