from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import (
    auth, billing, family, follows, invite, me, mute, timeline, users, visibility, wakes,
)
from .scheduler import start as start_scheduler, stop as stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


_docs_disabled = settings.is_production
app = FastAPI(
    title="OKITA",
    version="0.2.0",
    lifespan=lifespan,
    docs_url=None if _docs_disabled else "/docs",
    redoc_url=None if _docs_disabled else "/redoc",
    openapi_url=None if _docs_disabled else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(follows.router)
app.include_router(visibility.router)
app.include_router(mute.router)
app.include_router(timeline.router)
app.include_router(wakes.router)
app.include_router(me.router)
app.include_router(billing.router)
app.include_router(family.router)
app.include_router(invite.router)


@app.get("/health")
def health():
    return {"status": "ok"}
