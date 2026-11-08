"""Legacy facade re-exporting ImageCollector from turismo.places.infrastructure."""
from __future__ import annotations

from turismo.places.infrastructure.image_collector import (
    ATTRIBUTION_FILE,
    COMMONS_USER_AGENT,
    DEFAULTS_DIR,
    PUBLIC_IMAGES_DIR,
    ImageCollector,
    copy_category_default,
    fetch_opengraph_image,
    fetch_wikimedia_commons_image,
    optimize_and_save_webp,
)

__all__ = [
    "ATTRIBUTION_FILE",
    "COMMONS_USER_AGENT",
    "DEFAULTS_DIR",
    "PUBLIC_IMAGES_DIR",
    "ImageCollector",
    "copy_category_default",
    "fetch_opengraph_image",
    "fetch_wikimedia_commons_image",
    "optimize_and_save_webp",
]
