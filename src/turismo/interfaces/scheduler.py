"""Legacy facade re-exporting scheduler functions from turismo.app.scheduler."""
from __future__ import annotations

from turismo.app.scheduler import (
    create_scheduler,
    job_compute_scores,
    job_events,
    job_mincetur,
    job_open_meteo,
    job_osm,
)

__all__ = [
    "create_scheduler",
    "job_compute_scores",
    "job_events",
    "job_mincetur",
    "job_open_meteo",
    "job_osm",
]
