"""Declarative classification of places into 4 kinds.

Attraction: Historical/cultural/natural tourist sites.
Lodging: Hotels, hostels, guest houses.
Food: Restaurants, cafes, food courts.
Activity: Commercial outdoor activities, surf schools, tours.
Unclassified: Places that do not match any known rule (hidden and un-scored).
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from turismo.domain.models import PlaceKind


def load_classification_rules(config_path: Path | str | None = None) -> list[dict[str, Any]]:
    """Load classification rules from yaml file."""
    path = Path("config/classification.yaml") if config_path is None else Path(config_path)

    if not path.exists():
        return []

    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    rules = data.get("rules", [])
    return list(rules) if isinstance(rules, list) else []


_RULES_CACHE: list[dict[str, Any]] | None = None


def get_rules() -> list[dict[str, Any]]:
    global _RULES_CACHE
    if _RULES_CACHE is None:
        _RULES_CACHE = load_classification_rules()
    return _RULES_CACHE


def classify_place(
    tags: dict[str, str] | None = None,
    source: str = "osm",
    category: str | None = None,
    rules: list[dict[str, Any]] | None = None,
) -> PlaceKind:
    """Classify a place into one of the 4 kinds using declarative rules."""
    if source == "manual":
        return PlaceKind.ATTRACTION

    active_rules = rules if rules is not None else get_rules()
    tags = tags or {}

    for rule in active_rules:
        target_kind = PlaceKind(rule["kind"])
        match_criteria = rule.get("match", {})
        for tag_key, allowed_values in match_criteria.items():
            if tag_key in tags:
                actual_val = str(tags[tag_key]).lower()
                if "*" in allowed_values or actual_val in [str(v).lower() for v in allowed_values]:
                    return target_kind

    # Fallback to category if tags are missing (e.g. for existing DB records)
    if category:
        cat_lower = category.lower()
        if cat_lower in ("hotel", "hostel", "lodging"):
            return PlaceKind.LODGING
        if cat_lower in ("restaurant", "cafe", "food"):
            return PlaceKind.FOOD
        if cat_lower in ("attraction", "museum", "site"):
            return PlaceKind.ATTRACTION
        if cat_lower in ("activity", "surf", "tour"):
            return PlaceKind.ACTIVITY

    return PlaceKind.UNCLASSIFIED
