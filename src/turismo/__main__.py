"""CLI entrypoint delegating to the modular composition root (turismo.app.cli)."""
from __future__ import annotations

from turismo.app.cli import (
    _print_usage,
    _run_api,
    _run_collector,
    _run_dev_server,
    _run_migrate,
    _run_scheduler,
    _run_score,
    _run_seed_safety,
    main,
)

__all__ = [
    "_print_usage",
    "_run_api",
    "_run_collector",
    "_run_dev_server",
    "_run_migrate",
    "_run_scheduler",
    "_run_score",
    "_run_seed_safety",
    "main",
]

if __name__ == "__main__":
    main()
