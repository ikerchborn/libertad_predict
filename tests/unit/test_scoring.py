"""Unit tests for pure scoring functions.

No network, no database, no filesystem — pure Python only.
"""
from __future__ import annotations

from datetime import UTC, date, datetime

import pytest

from turismo.domain.models import PlaceDetail, PlaceKind
from turismo.domain.scoring import (
    CalendarInputs,
    FactorScore,
    MarineInputs,
    PriceInputs,
    SeasonalityInputs,
    WeatherInputs,
    combine_factors,
    compute_recommendation_score,
    normalize_inverted,
    normalize_linear,
    score_calendar,
    score_marine,
    score_price,
    score_safety,
    score_seasonality,
    score_weather,
)

_DATE = date(2024, 7, 15)
_SOURCE = "test"


class TestNormalizeLinear:
    def test_at_low_returns_zero(self) -> None:
        assert normalize_linear(0.0, 0.0, 10.0) == 0.0

    def test_at_high_returns_one(self) -> None:
        assert normalize_linear(10.0, 0.0, 10.0) == 1.0

    def test_midpoint(self) -> None:
        assert normalize_linear(5.0, 0.0, 10.0) == pytest.approx(0.5)

    def test_below_low_clamps_to_zero(self) -> None:
        assert normalize_linear(-5.0, 0.0, 10.0) == 0.0

    def test_above_high_clamps_to_one(self) -> None:
        assert normalize_linear(15.0, 0.0, 10.0) == 1.0

    def test_equal_low_high_returns_one(self) -> None:
        assert normalize_linear(5.0, 5.0, 5.0) == 1.0


class TestNormalizeInverted:
    def test_at_low_returns_one(self) -> None:
        assert normalize_inverted(0.0, 0.0, 10.0) == 1.0

    def test_at_high_returns_zero(self) -> None:
        assert normalize_inverted(10.0, 0.0, 10.0) == 0.0

    def test_midpoint(self) -> None:
        assert normalize_inverted(5.0, 0.0, 10.0) == pytest.approx(0.5)


class TestCombineFactors:
    def test_empty_list_returns_zero(self) -> None:
        score, confidence = combine_factors([], total_possible_weight=10.0)
        assert score == 0.0
        assert confidence == 0.0

    def test_all_zero_weights_returns_zero(self) -> None:
        factors = [
            FactorScore("f1", 0.8, 0.0, "ok", _SOURCE, _DATE),
            FactorScore("f2", 0.5, 0.0, "ok", _SOURCE, _DATE),
        ]
        score, confidence = combine_factors(factors, total_possible_weight=0.0)
        assert score == 0.0
        assert confidence == 0.0

    def test_single_perfect_factor(self) -> None:
        factors = [FactorScore("f1", 1.0, 2.0, "ok", _SOURCE, _DATE)]
        score, confidence = combine_factors(factors, total_possible_weight=2.0)
        assert score == pytest.approx(100.0)
        assert confidence == pytest.approx(1.0)

    def test_single_factor_partial_confidence(self) -> None:
        # Only 2 out of 10 total weight is present
        factors = [FactorScore("f1", 1.0, 2.0, "ok", _SOURCE, _DATE)]
        score, confidence = combine_factors(factors, total_possible_weight=10.0)
        assert score == pytest.approx(100.0)
        assert confidence == pytest.approx(0.2)

    def test_two_factors_averaged_by_weight(self) -> None:
        factors = [
            FactorScore("f1", 1.0, 1.0, "ok", _SOURCE, _DATE),  # contributes 1.0
            FactorScore("f2", 0.0, 1.0, "ok", _SOURCE, _DATE),  # contributes 0.0
        ]
        score, confidence = combine_factors(factors, total_possible_weight=2.0)
        assert score == pytest.approx(50.0)
        assert confidence == pytest.approx(1.0)

    def test_confidence_capped_at_one(self) -> None:
        factors = [FactorScore("f1", 1.0, 5.0, "ok", _SOURCE, _DATE)]
        # total_possible_weight < actual weight — confidence capped at 1
        _, confidence = combine_factors(factors, total_possible_weight=3.0)
        assert confidence <= 1.0

    def test_missing_factor_excluded_and_contributions_sum_to_score(self) -> None:
        """Point 5: A factor without data does not enter the calculation.
        Renormalized weights sum to 100% and factor contributions sum to the total score.
        """
        active_factors = [
            FactorScore("weather_temperature", 0.85, 3.0, "ok", _SOURCE, _DATE),
            FactorScore("weather_rain", 0.60, 2.0, "ok", _SOURCE, _DATE),
        ]
        total_possible_weight = 10.0  # e.g., missing price factor with weight 5.0
        score, confidence = combine_factors(
            active_factors, total_possible_weight=total_possible_weight
        )

        active_weight_sum = sum(f.weight for f in active_factors)
        assert active_weight_sum == 5.0

        renormalized_weights = [f.weight / active_weight_sum for f in active_factors]
        assert sum(renormalized_weights) == pytest.approx(1.0)

        contributions = [
            100.0 * (f.normalized_value * f.weight) / active_weight_sum
            for f in active_factors
        ]
        assert sum(contributions) == pytest.approx(score)
        assert confidence == pytest.approx(0.5)


class TestScoreWeather:
    def _weights(self) -> dict[str, float]:
        return {"temperature": 3.0, "rain": 4.0, "uv": 1.0, "wind": 1.0}

    def _thresholds(self) -> dict[str, float]:
        return {
            "temp_ideal_low": 18.0,
            "temp_ideal_high": 28.0,
            "precip_max": 10.0,
            "uv_max": 8.0,
            "wind_max": 40.0,
        }

    def test_ideal_conditions_score_high(self) -> None:
        inputs = WeatherInputs(
            temp_max_c=26.0,
            temp_min_c=20.0,
            precipitation_mm=0.0,
            rain_probability=0.0,
            uv_index=3.0,
            wind_speed_kmh=10.0,
        )
        t = self._thresholds()
        factors = score_weather(
            inputs,
            temp_ideal_low=t["temp_ideal_low"],
            temp_ideal_high=t["temp_ideal_high"],
            precip_max=t["precip_max"],
            uv_max=t["uv_max"],
            wind_max=t["wind_max"],
            source=_SOURCE,
            data_date=_DATE,
            weights=self._weights(),
        )
        total_w = sum(f.weight for f in factors)
        weighted = sum(f.normalized_value * f.weight for f in factors)
        assert (weighted / total_w) > 0.8

    def test_max_rain_scores_zero(self) -> None:
        inputs = WeatherInputs(
            temp_max_c=23.0,
            temp_min_c=20.0,
            precipitation_mm=10.0,
            rain_probability=1.0,
            uv_index=3.0,
            wind_speed_kmh=10.0,
        )
        t = self._thresholds()
        factors = score_weather(
            inputs,
            temp_ideal_low=t["temp_ideal_low"],
            temp_ideal_high=t["temp_ideal_high"],
            precip_max=t["precip_max"],
            uv_max=t["uv_max"],
            wind_max=t["wind_max"],
            source=_SOURCE,
            data_date=_DATE,
            weights=self._weights(),
        )
        rain_factor = next(f for f in factors if f.name == "weather_rain")
        assert rain_factor.normalized_value == pytest.approx(0.0)

    def test_zero_weight_factor_excluded(self) -> None:
        weights = {"temperature": 3.0, "rain": 0.0, "uv": 0.0, "wind": 0.0}
        inputs = WeatherInputs(23.0, 20.0, 0.0, 0.0, 3.0, 10.0)
        t = self._thresholds()
        factors = score_weather(
            inputs,
            temp_ideal_low=t["temp_ideal_low"],
            temp_ideal_high=t["temp_ideal_high"],
            precip_max=t["precip_max"],
            uv_max=t["uv_max"],
            wind_max=t["wind_max"],
            source=_SOURCE,
            data_date=_DATE,
            weights=weights,
        )
        assert all(f.name == "weather_temperature" for f in factors)
        assert len(factors) == 1


class TestScoreMarine:
    def test_calm_sea_scores_high(self) -> None:
        inputs = MarineInputs(wave_height_m=0.5, wave_period_s=8.0)
        factors = score_marine(
            inputs,
            wave_height_max=3.0,
            wave_period_min=5.0,
            wave_period_max=12.0,
            source=_SOURCE,
            data_date=_DATE,
            weights={"wave_height": 3.0, "wave_period": 2.0},
        )
        height_f = next(f for f in factors if f.name == "marine_wave_height")
        assert height_f.normalized_value > 0.8

    def test_extreme_wave_height_scores_zero(self) -> None:
        inputs = MarineInputs(wave_height_m=3.0, wave_period_s=8.0)
        factors = score_marine(
            inputs,
            wave_height_max=3.0,
            wave_period_min=5.0,
            wave_period_max=12.0,
            source=_SOURCE,
            data_date=_DATE,
            weights={"wave_height": 3.0, "wave_period": 2.0},
        )
        height_f = next(f for f in factors if f.name == "marine_wave_height")
        assert height_f.normalized_value == pytest.approx(0.0)


class TestScoreCalendar:
    def _weights(self) -> dict[str, float]:
        return {"weekend": 2.0, "crowd": 3.0}

    def test_weekday_no_event_scores_high(self) -> None:
        inputs = CalendarInputs(query_date=_DATE, crowd_level=0, is_weekend=False)
        factors = score_calendar(
            inputs,
            weekend_penalty=0.3,
            crowd_penalty_per_level=0.15,
            source=_SOURCE,
            data_date=_DATE,
            weights=self._weights(),
        )
        weekend_f = next(f for f in factors if f.name == "calendar_weekend")
        assert weekend_f.normalized_value == pytest.approx(1.0)

    def test_weekend_applies_penalty(self) -> None:
        inputs = CalendarInputs(query_date=_DATE, crowd_level=0, is_weekend=True)
        factors = score_calendar(
            inputs,
            weekend_penalty=0.3,
            crowd_penalty_per_level=0.15,
            source=_SOURCE,
            data_date=_DATE,
            weights=self._weights(),
        )
        weekend_f = next(f for f in factors if f.name == "calendar_weekend")
        assert weekend_f.normalized_value == pytest.approx(0.7)

    def test_max_crowd_level_5_penalizes(self) -> None:
        inputs = CalendarInputs(query_date=_DATE, crowd_level=5, is_weekend=False)
        factors = score_calendar(
            inputs,
            weekend_penalty=0.3,
            crowd_penalty_per_level=0.15,
            source=_SOURCE,
            data_date=_DATE,
            weights=self._weights(),
        )
        crowd_f = next(f for f in factors if f.name == "calendar_crowd")
        # 1.0 - 5*0.15 = 0.25
        assert crowd_f.normalized_value == pytest.approx(0.25)


class TestScoreSeasonality:
    def test_average_month_scores_mid(self) -> None:
        inputs = SeasonalityInputs(monthly_visitors=1000, annual_avg_visitors=1000.0)
        factors = score_seasonality(
            inputs,
            source=_SOURCE,
            data_date=_DATE,
            weights={"seasonality": 2.0},
        )
        f = factors[0]
        # ratio=1.0 → normalize_inverted(1.0, 0, 3) = 1 - 1/3 ≈ 0.667
        assert f.normalized_value == pytest.approx(2 / 3, abs=0.01)

    def test_triple_average_scores_zero(self) -> None:
        inputs = SeasonalityInputs(monthly_visitors=3000, annual_avg_visitors=1000.0)
        factors = score_seasonality(
            inputs,
            source=_SOURCE,
            data_date=_DATE,
            weights={"seasonality": 2.0},
        )
        assert factors[0].normalized_value == pytest.approx(0.0)

    def test_zero_avg_visitors_returns_full_score(self) -> None:
        inputs = SeasonalityInputs(monthly_visitors=0, annual_avg_visitors=0.0)
        factors = score_seasonality(
            inputs,
            source=_SOURCE,
            data_date=_DATE,
            weights={"seasonality": 2.0},
        )
        # ratio defaults to 1.0 when avg=0 (avoids division by zero)
        assert factors[0].normalized_value == pytest.approx(2 / 3, abs=0.01)


class TestScorePrice:
    def test_below_median_scores_high(self) -> None:
        inputs = PriceInputs(price_usd=50.0, median_price_usd=100.0, snapshot_count=10)
        factors = score_price(
            inputs,
            min_snapshots=7,
            source=_SOURCE,
            data_date=_DATE,
            weights={"price": 3.0},
        )
        assert len(factors) == 1
        assert factors[0].normalized_value > 0.8

    def test_too_few_snapshots_skips_factor(self) -> None:
        inputs = PriceInputs(price_usd=100.0, median_price_usd=100.0, snapshot_count=3)
        factors = score_price(
            inputs,
            min_snapshots=7,
            source=_SOURCE,
            data_date=_DATE,
            weights={"price": 3.0},
        )
        assert factors == []

    def test_exactly_min_snapshots_includes_factor(self) -> None:
        inputs = PriceInputs(price_usd=100.0, median_price_usd=100.0, snapshot_count=7)
        factors = score_price(
            inputs,
            min_snapshots=7,
            source=_SOURCE,
            data_date=_DATE,
            weights={"price": 3.0},
        )
        assert len(factors) == 1

    def test_double_median_scores_low(self) -> None:
        inputs = PriceInputs(price_usd=200.0, median_price_usd=100.0, snapshot_count=10)
        factors = score_price(
            inputs,
            min_snapshots=7,
            source=_SOURCE,
            data_date=_DATE,
            weights={"price": 3.0},
        )
        assert factors[0].normalized_value < 0.4


class TestComputeRecommendationScore:
    def test_full_commercial_details_scores_high_and_includes_factors(self) -> None:
        detail = PlaceDetail(
            place_id=10,
            website="https://hotel.example.com",
            phone="+51 44 123456",
            opening_hours="24 horas",
            stars=4.5,
            price_min=100.0,
            price_max=150.0,
            maps_url="https://www.google.com/maps/search/?api=1&query=Hotel",
            source="web_structured",
            fetched_at=datetime(2026, 7, 1, tzinfo=UTC),
        )
        res = compute_recommendation_score(
            place_id=10,
            kind=PlaceKind.LODGING,
            place_lat=-8.0731,
            place_lon=-79.1200,
            place_detail=detail,
            ref_lat=-8.0740,
            ref_lon=-79.1210,
            ref_name="Balneario de Huanchaco",
            median_price=150.0,
            crowd_level=1,
        )
        assert res.score > 80.0
        assert res.confidence > 0.8
        assert res.distance_km is not None and res.distance_km < 1.0
        factor_names = {f.name for f in res.breakdown}
        assert "cercania" in factor_names
        assert "completitud" in factor_names
        assert "precio_relativo" in factor_names
        assert "calificacion_externa" in factor_names

    def test_missing_factors_are_omitted_and_renormalized_never_invented(self) -> None:
        # Place with no stars, no price, no reference proximity -> those factors omitted
        res = compute_recommendation_score(
            place_id=20,
            kind=PlaceKind.FOOD,
            place_lat=-8.11,
            place_lon=-79.03,
            place_detail=None,
        )
        factor_names = {f.name for f in res.breakdown}
        assert "calificacion_externa" not in factor_names
        assert "precio_relativo" not in factor_names
        assert "cercania" not in factor_names
        assert "seguridad" not in factor_names
        assert 0.0 <= res.score <= 100.0
        assert res.confidence < 0.5

    def test_safety_score_included_when_present_and_omitted_when_null(self) -> None:
        # 1. Attraction / general score_safety: None returns empty list
        assert (
            score_safety(None, source=_SOURCE, data_date=_DATE, weights={"safety": 2.0})
            == []
        )
        # 2. Attraction / general score_safety: 85/100 returns normalized 0.85
        sf = score_safety(85.0, source=_SOURCE, data_date=_DATE, weights={"safety": 2.0})
        assert len(sf) == 1
        assert sf[0].normalized_value == pytest.approx(0.85)

        # 3. Commercial recommendation score with safety_score=90.0 includes 'seguridad'
        detail = PlaceDetail(
            place_id=30,
            maps_url="https://www.google.com/maps/search/?api=1&query=Test",
            safety_score=90.0,
            source="osm",
            fetched_at=datetime(2026, 7, 1, tzinfo=UTC),
        )
        res = compute_recommendation_score(
            place_id=30,
            kind=PlaceKind.LODGING,
            place_lat=-8.11,
            place_lon=-79.03,
            place_detail=detail,
        )
        assert "seguridad" in {f.name for f in res.breakdown}

