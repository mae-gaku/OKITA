import logging

import httpx

from .config import settings

logger = logging.getLogger("okita.push")


async def send_push(
    expo_push_token: str, title: str, body: str, data: dict | None = None
) -> None:
    if not expo_push_token:
        return
    payload = {
        "to": expo_push_token,
        "title": title,
        "body": body,
        "sound": "default",
        "data": data or {},
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(settings.expo_push_url, json=payload)
            r.raise_for_status()
    except Exception as e:  # network failures shouldn't crash the scheduler
        logger.warning("Expo push failed: %s", e)
