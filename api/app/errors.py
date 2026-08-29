from __future__ import annotations

import asyncpg
from fastapi import HTTPException, status


class NotFoundError(Exception):
    pass


def is_fk_error(err: Exception) -> bool:
    if isinstance(err, asyncpg.ForeignKeyViolationError):
        return True
    msg = str(err).lower()
    return "foreign key" in msg or "23503" in msg


def is_check_error(err: Exception) -> bool:
    if isinstance(err, asyncpg.CheckViolationError):
        return True
    msg = str(err).lower()
    return "check constraint" in msg or "23514" in msg


def handle_store_error(err: Exception) -> HTTPException:
    if isinstance(err, NotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not found")
    if isinstance(err, ValueError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err) or "invalid request",
        )
    if is_fk_error(err):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="related record not found",
        )
    if is_check_error(err):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid value",
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="internal error",
    )
