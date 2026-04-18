"""
Simple token-based auth.
On login we generate a token = "user_id:<id>" encoded in base64.
No JWT needed — straightforward for this app.
"""
import base64
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User


def make_token(user_id: int) -> str:
    raw = f"user_id:{user_id}"
    return base64.b64encode(raw.encode()).decode()


def decode_token(token: str) -> int:
    try:
        raw = base64.b64decode(token.encode()).decode()
        prefix, uid = raw.split(":")
        assert prefix == "user_id"
        return int(uid)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(
    x_auth_token: str = Header(..., alias="X-Auth-Token"),
    db: Session = Depends(get_db),
) -> User:
    user_id = decode_token(x_auth_token)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
