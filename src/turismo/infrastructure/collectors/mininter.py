"""MININTER Delito Georreferenciado & SIDPOL PNP Safety Collector.

Reverse-engineers the official crime map from the Ministry of the Interior:
https://aplicaciones.mininter.gob.pe/mapadeldelitogeoreferenciado/
which queries the ArcGIS FeatureServer:
https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/SIDPOL_DELITOS_TOTAL/FeatureServer/25

Strict Zero-Double-Spend and Offline-Persistence:
- Queries are cached spatially (radius ~250m) during seeding.
- Exports to `data/seeds/places_safety_snapshot.json`.
- Persists to `place_details.safety_score` and `place_details.safety_report_json` in SQLite.
- Production runtime never makes outbound HTTP requests to MININTER.
"""
from __future__ import annotations

import json
import logging
import math
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx

from turismo.domain.models import PlaceSafetyReport

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

SNAPSHOT_SAFETY_PATH = Path("data/seeds/places_safety_snapshot.json")
MININTER_FEATURE_SERVER = (
    "https://services6.arcgis.com/lMIZrqiJkpM748BR/arcgis/rest/services/"
    "SIDPOL_DELITOS_TOTAL/FeatureServer/25/query"
)
MININTER_USER_AGENT = "TurismoLaLibertad/1.0 (+https://github.com/turismo-la-libertad)"

MODALITY_LABELS: dict[str, str] = {
    "HURTO DE CELULAR": "Arrebato de teléfono celular",
    "HURTO": "Hurto simple de pertenencias / carteristas",
    "HURTO AGRAVADO": "Hurto agravado en vía pública",
    "ESTAFA": "Estafa o engaño comercial",
    "ESTAFA Y OTRAS DEFRAUDACIONES": "Fraude o estafa económica",
    "EXTORSION": "Incidencias de extorsión comercial",
    "ROBO": "Robo con violencia",
    "ROBO AGRAVADO": "Robo agravado a transeúnte",
    "VIOLENCIA FISICA": "Violencia interpersonal / física",
    "VIOLENCIA PSICOLOGICA": "Conflictos domésticos / violencia psicológica",
}


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two coordinates."""
    r = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def fetch_arcgis_incidents(
    client: httpx.Client,
    lat: float,
    lon: float,
    radius_meters: int = 1000,
) -> list[dict[str, Any]]:
    """Query official SIDPOL/MININTER FeatureServer for georeferenced incidents."""
    params = {
        "f": "json",
        "geometry": f"{lon:.6f},{lat:.6f}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "distance": str(radius_meters),
        "units": "esriSRUnit_Meter",
        "outFields": (
            "OBJECTID,fecha_hora_registro_hecho,turno_hecho,año_hecho,"
            "mes_hecho,dia_hecho,tipo_hecho,subtipo_hecho,modalidad_hecho,distrito_hecho"
        ),
        "returnGeometry": "false",
        "resultRecordCount": "2000",
    }
    headers = {"User-Agent": MININTER_USER_AGENT}
    try:
        resp = client.get(MININTER_FEATURE_SERVER, params=params, headers=headers, timeout=25.0)
        if resp.status_code != 200:
            logger.warning("MININTER query failed with status %d", resp.status_code)
            return []
        data = resp.json()
        features = data.get("features", [])
        return [f.get("attributes", {}) for f in features if isinstance(f, dict)]
    except Exception as exc:
        logger.warning("Error querying MININTER ArcGIS server: %s", exc)
        return []


def build_safety_report_from_incidents(
    lat: float,
    lon: float,
    incidents: list[dict[str, Any]],
    radius_meters: int = 1000,
    place_name: str = "",
) -> PlaceSafetyReport:
    """Analyze real police incidents into a structured tourist safety diagnosis."""
    count = len(incidents)

    # 1. Distribution by Shift (turno_hecho)
    shifts: dict[str, int] = {"mañana": 0, "tarde": 0, "noche": 0, "madrugada": 0}
    for item in incidents:
        t = str(item.get("turno_hecho") or "").lower().strip()
        if "mañ" in t or "man" in t:
            shifts["mañana"] += 1
        elif "tar" in t:
            shifts["tarde"] += 1
        elif "noc" in t:
            shifts["noche"] += 1
        elif "mad" in t:
            shifts["madrugada"] += 1
        else:
            shifts["tarde"] += 1

    total_shifts = max(1, count)
    shift_percentages = {
        k: round((v / total_shifts) * 100.0, 1) for k, v in shifts.items()
    }

    # Find shift with highest crime count
    critical_shift = max(shifts.items(), key=lambda x: x[1])[0] if count > 0 else "noche"

    # 2. Modalities and Subtypes
    raw_crimes: dict[str, int] = {}
    for item in incidents:
        mod = str(item.get("modalidad_hecho") or "").strip().upper()
        sub = str(item.get("subtipo_hecho") or "").strip().upper()
        key = mod if mod and mod != "NONE" else sub
        if key:
            raw_crimes[key] = raw_crimes.get(key, 0) + 1

    sorted_crimes = sorted(raw_crimes.items(), key=lambda x: x[1], reverse=True)[:5]
    top_crimes = [
        {
            "name": MODALITY_LABELS.get(name, name.title()),
            "count": cnt,
            "percentage": round((cnt / total_shifts) * 100.0, 1),
        }
        for name, cnt in sorted_crimes
    ]

    # 3. Deterministic Safety Score Calculation (0 - 100)
    # Higher count = lower score.
    if count == 0:
        score = 98.0
        risk_level = "Muy Seguro"
    elif count <= 10:
        score = round(max(88.0, 98.0 - count * 0.9), 1)
        risk_level = "Muy Seguro"
    elif count <= 50:
        score = round(max(78.0, 89.0 - (count - 10) * 0.25), 1)
        risk_level = "Seguro"
    elif count <= 200:
        score = round(max(64.0, 78.0 - (count - 50) * 0.09), 1)
        risk_level = "Moderado"
    elif count <= 600:
        score = round(max(52.0, 64.0 - (count - 200) * 0.03), 1)
        risk_level = "Precaución"
    else:
        score = round(max(40.0, 52.0 - (count - 600) * 0.008), 1)
        risk_level = "Riesgo Urbano / Desfavorable de Noche"

    # 4. Critical Hours (Cuándo NO ir)
    night_madrugada_pct = shift_percentages["noche"] + shift_percentages["madrugada"]
    if count == 0:
        unsafe_hours = "Sin horas críticas detectadas en el radio oficial de 1,000 m."
        safe_hours = "08:00 a 17:30 hrs (Horario turístico habitual recomendado)."
    elif night_madrugada_pct >= 50.0:
        unsafe_hours = (
            f"19:00 a 05:59 hrs (Turnos Noche y Madrugada concentran el "
            f"{night_madrugada_pct:.0f}% de las incidencias)."
        )
        safe_hours = "08:30 a 16:30 hrs (Turno con vigilancia policial diurna y plena iluminación)."
    else:
        unsafe_hours = (
            f"18:30 a 05:00 hrs (Horas de baja visibilidad y registro en turno {critical_shift})."
        )
        safe_hours = "09:00 a 17:00 hrs (Franja recomendada para recorridos y actividades)."

    # 5. Critical Dates / Days Notice
    unsafe_dates_notice = (
        "Mayor incidencia estadística en fines de semana (viernes noche, sábado y domingo) "
        "y fechas festivas locales de alta afluencia comercial."
    )

    # 6. Actionable Tourist Safety Recommendations
    recommendations: list[str] = []
    if count <= 10:
        recommendations.append(
            "Zona con índice criminal mínimo o nulo. Mantenga normas generales de cuidado."
        )
        recommendations.append(
            "En áreas campestres o arqueológicas, manténgase en senderos señalizados."
        )
    else:
        # Check specific crime types
        crime_names_joined = " ".join(
            [str(c.get("name", "")).lower() for c in top_crimes]
        )
        if "celular" in crime_names_joined or "arrebato" in crime_names_joined:
            recommendations.append(
                "Evite manipular o exponer teléfonos móviles en aceras o cerca de la calzada."
            )
        if "carteristas" in crime_names_joined or "hurto" in crime_names_joined:
            recommendations.append(
                "Lleve mochilas y bolsos hacia adelante en zonas de aglomeración comercial."
            )
        if "estafa" in crime_names_joined:
            recommendations.append(
                "Contrate servicios turísticos únicamente en agencias registradas ante MINCETUR."
            )
        recommendations.append(
            "Planifique retornar antes de las 19:00 hrs y priorice el uso de taxis autorizados."
        )
        recommendations.append(
            "Porte solo una copia de su documento de identidad y proteja sus tarjetas bancarias."
        )

    return PlaceSafetyReport(
        score=score,
        risk_level=risk_level,
        incident_count=count,
        radius_meters=radius_meters,
        shifts=shifts,
        shift_percentages=shift_percentages,
        critical_shift=critical_shift,
        unsafe_hours=unsafe_hours,
        safe_hours=safe_hours,
        unsafe_dates_notice=unsafe_dates_notice,
        top_crimes=top_crimes,
        recommendations=recommendations,
        source="MININTER - Sistema de Denuncias Policiales (SIDPOL)",
        evaluated_at=datetime.now(tz=UTC),
    )


def seed_places_safety_snapshot(
    session: Session,
    force_fetch: bool = False,
) -> int:
    """Populate safety reports for all places from snapshot or ArcGIS MININTER API."""
    from sqlalchemy import select

    from turismo.infrastructure.db.models import PlaceDetailORM, PlaceORM

    places = session.scalars(select(PlaceORM).order_by(PlaceORM.id)).all()
    if not places:
        logger.info("No places found in database to evaluate safety.")
        return 0

    # Step 1: Check existing snapshot JSON
    snapshot_data: dict[str, Any] = {}
    if SNAPSHOT_SAFETY_PATH.exists() and not force_fetch:
        try:
            snapshot_data = json.loads(SNAPSHOT_SAFETY_PATH.read_text(encoding="utf-8"))
            logger.info("Loaded safety snapshot with %d entries.", len(snapshot_data))
        except Exception as exc:
            logger.warning("Could not read safety snapshot: %s", exc)

    # Step 2: Proximity cluster cache to minimize outbound calls
    # Key: cluster tuple -> incidents list
    cluster_cache: list[tuple[float, float, list[dict[str, Any]]]] = []

    client: httpx.Client | None = None
    updated_count = 0

    try:
        for p in places:
            key = str(p.id)
            report_dict = snapshot_data.get(key)

            if report_dict and not force_fetch:
                # Fast path: use cached report from snapshot
                report = PlaceSafetyReport.model_validate(report_dict)
            else:
                # Need to fetch or find close cluster
                if client is None:
                    client = httpx.Client(timeout=30.0)

                # Check if we have a cached query within 250m
                matching_incidents: list[dict[str, Any]] | None = None
                for c_lat, c_lon, c_incidents in cluster_cache:
                    if haversine_distance_m(p.lat, p.lon, c_lat, c_lon) <= 250.0:
                        matching_incidents = c_incidents
                        break

                if matching_incidents is None:
                    logger.info(
                        "Fetching MININTER SIDPOL for place #%d: %s (%.5f, %.5f)...",
                        p.id,
                        p.name,
                        p.lat,
                        p.lon,
                    )
                    matching_incidents = fetch_arcgis_incidents(client, p.lat, p.lon, 1000)
                    cluster_cache.append((p.lat, p.lon, matching_incidents))

                report = build_safety_report_from_incidents(
                    lat=p.lat,
                    lon=p.lon,
                    incidents=matching_incidents,
                    radius_meters=1000,
                    place_name=p.name,
                )
                snapshot_data[key] = report.model_dump(mode="json")

            # Update place_details table in DB
            detail = session.scalar(select(PlaceDetailORM).where(PlaceDetailORM.place_id == p.id))
            if detail:
                detail.safety_score = report.score
                detail.safety_report_json = report.model_dump(mode="json")
                updated_count += 1

        session.commit()

        # Step 3: Write out updated snapshot JSON for offline persistence
        SNAPSHOT_SAFETY_PATH.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT_SAFETY_PATH.write_text(
            json.dumps(snapshot_data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        logger.info(
            "Successfully seeded safety reports for %d places and saved snapshot to %s",
            updated_count,
            SNAPSHOT_SAFETY_PATH,
        )
    finally:
        if client:
            client.close()

    return updated_count
