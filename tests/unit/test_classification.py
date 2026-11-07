"""Unit tests for declarative place classification into 4 kinds."""
from __future__ import annotations

from turismo.domain.classification import classify_place
from turismo.domain.models import PlaceKind


def test_manual_source_always_classified_as_attraction() -> None:
    assert classify_place(tags={}, source="manual") == PlaceKind.ATTRACTION
    assert classify_place(tags={"tourism": "hotel"}, source="manual") == PlaceKind.ATTRACTION


def test_osm_tags_classify_into_four_kinds() -> None:
    # Attraction
    assert classify_place(tags={"tourism": "attraction"}) == PlaceKind.ATTRACTION
    assert classify_place(tags={"tourism": "museum"}) == PlaceKind.ATTRACTION
    assert classify_place(tags={"historic": "archaeological_site"}) == PlaceKind.ATTRACTION

    # Lodging
    assert classify_place(tags={"tourism": "hotel"}) == PlaceKind.LODGING
    assert classify_place(tags={"tourism": "hostel"}) == PlaceKind.LODGING
    assert classify_place(tags={"tourism": "guest_house"}) == PlaceKind.LODGING

    # Food
    assert classify_place(tags={"amenity": "restaurant"}) == PlaceKind.FOOD
    assert classify_place(tags={"amenity": "cafe"}) == PlaceKind.FOOD
    assert classify_place(tags={"amenity": "fast_food"}) == PlaceKind.FOOD

    # Activity
    assert classify_place(tags={"sport": "surf"}) == PlaceKind.ACTIVITY
    assert classify_place(tags={"leisure": "water_park"}) == PlaceKind.ACTIVITY
    assert classify_place(tags={"tourism": "information"}) == PlaceKind.ACTIVITY


def test_unmatched_osm_tags_return_unclassified() -> None:
    assert classify_place(tags={"shop": "supermarket"}) == PlaceKind.UNCLASSIFIED
    assert classify_place(tags={}) == PlaceKind.UNCLASSIFIED
