"""Unit tests for the modular places bounded context."""
from __future__ import annotations

from turismo.places.api import router as places_router
from turismo.places.domain.classification import classify_place
from turismo.places.domain.models import CoastType, Place, PlaceCategory, PlaceKind


def test_places_domain_classification_and_entity() -> None:
    kind = classify_place(
        tags={"historic": "archaeological_site"},
        source="osm",
        category="attraction",
    )
    assert kind == PlaceKind.ATTRACTION

    place = Place(
        id=1,
        osm_id=999,
        name="Huacas del Sol y de la Luna",
        category=PlaceCategory.ATTRACTION,
        kind=kind,
        coast_type=CoastType.INLAND,
        lat=-8.135,
        lon=-78.991,
        source="osm",
    )
    assert place.kind == PlaceKind.ATTRACTION


def test_places_router_exposes_expected_endpoints() -> None:
    paths = {getattr(route, "path", "") for route in places_router.routes}
    assert "/places" in paths
    assert "/places/{place_id}" in paths
    assert "/places/{place_id}/nearby" in paths
