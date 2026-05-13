import secrets

from fastapi import Header, HTTPException, status

TOKEN: str = secrets.token_urlsafe(32)


async def require_token(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    presented = authorization.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(presented, TOKEN):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
