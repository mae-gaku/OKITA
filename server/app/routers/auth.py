from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import jwt
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..db import get_session
from ..models import User
from ..schemas import TokenOut, UserCreate, UserOut, PushTokenIn
from ..security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)


class AppleAuthIn(BaseModel):
    identity_token: str
    display_name: str | None = Field(default=None, max_length=40)
    handle: str | None = Field(default=None, pattern="^[a-zA-Z0-9_]+$", min_length=3, max_length=20)


class AppleAuthOut(BaseModel):
    """Either token+user, or 'needs_handle' to prompt the client."""
    needs_handle: bool = False
    suggested_display_name: str | None = None
    apple_email: str | None = None
    access_token: str | None = None
    user: UserOut | None = None
    token_type: str = "bearer"

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut)
def register(payload: UserCreate, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
    handle_lower = payload.handle.lower()
    handle_taken = session.exec(select(User).where(User.handle == handle_lower)).first()
    if handle_taken:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Handle already taken")
    user = User(
        email=payload.email,
        handle=handle_lower,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.from_user(user))


@router.post("/login", response_model=TokenOut)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    user = session.exec(select(User).where(User.email == form.username)).first()
    if not user or not user.password_hash or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return TokenOut(access_token=create_access_token(user.id), user=UserOut.from_user(user))


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return UserOut.from_user(current)


@router.post("/apple", response_model=AppleAuthOut)
def apple_login(
    payload: AppleAuthIn,
    session: Session = Depends(get_session),
):
    """Sign in / sign up with Apple. The identity_token is decoded WITHOUT
    signature verification for now — production must verify against
    https://appleid.apple.com/auth/keys (TODO for Phase 3 hardening)."""
    try:
        claims = jwt.get_unverified_claims(payload.identity_token)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid identity token")
    apple_sub = claims.get("sub")
    apple_email = claims.get("email")
    if not apple_sub:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token missing sub claim")

    # 1) Existing user by apple_sub
    user = session.exec(select(User).where(User.apple_sub == apple_sub)).first()
    if user:
        return AppleAuthOut(
            access_token=create_access_token(user.id),
            user=UserOut.from_user(user),
        )

    # 2) Existing user by email — link Apple sub
    if apple_email:
        user = session.exec(select(User).where(User.email == apple_email)).first()
        if user:
            user.apple_sub = apple_sub
            session.add(user)
            session.commit()
            session.refresh(user)
            return AppleAuthOut(
                access_token=create_access_token(user.id),
                user=UserOut.from_user(user),
            )

    # 3) New user — handle required
    if not payload.handle:
        return AppleAuthOut(
            needs_handle=True,
            suggested_display_name=payload.display_name,
            apple_email=apple_email,
        )

    handle_lower = payload.handle.lower()
    if session.exec(select(User).where(User.handle == handle_lower)).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Handle already taken")
    if not apple_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Apple did not return an email; cannot create account")

    user = User(
        email=apple_email,
        handle=handle_lower,
        display_name=payload.display_name or handle_lower,
        apple_sub=apple_sub,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return AppleAuthOut(
        access_token=create_access_token(user.id),
        user=UserOut.from_user(user),
    )


@router.post("/push-token", response_model=UserOut)
def set_push_token(
    payload: PushTokenIn,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    current.expo_push_token = payload.expo_push_token
    session.add(current)
    session.commit()
    session.refresh(current)
    return UserOut.from_user(current)
