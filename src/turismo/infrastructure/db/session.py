"""Legacy facade re-exporting database engine and session factory from turismo.shared.db."""
from __future__ import annotations

from turismo.shared.db import (
    _apply_sqlite_pragmas,
    _restrict_sqlite_file_permissions,
    create_engine,
    make_session_factory,
)

__all__ = [
    "_apply_sqlite_pragmas",
    "_restrict_sqlite_file_permissions",
    "create_engine",
    "make_session_factory",
]
