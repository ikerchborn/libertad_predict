"""Seed the 6 canonical La Libertad tourist places when external OSM is down."""
from turismo.config import Settings
from turismo.domain.models import CoastType, Place, PlaceCategory
from turismo.infrastructure.db.repositories import PlaceRepo
from turismo.infrastructure.db.session import create_engine, make_session_factory

CANONICAL_PLACES = [
    Place(
        osm_id=1001,
        name="Centro Histórico de Trujillo",
        category=PlaceCategory.ATTRACTION,
        coast_type=CoastType.INLAND,
        lat=-8.1159,
        lon=-79.0300,
        address="Plaza Mayor de Trujillo",
        source="manual",
    ),
    Place(
        osm_id=1002,
        name="Balneario de Huanchaco",
        category=PlaceCategory.ATTRACTION,
        coast_type=CoastType.COASTAL,
        lat=-8.0731,
        lon=-79.1200,
        address="Av. Víctor Larco Herrera, Huanchaco",
        source="manual",
    ),
    Place(
        osm_id=1003,
        name="Complejo Arqueológico Chan Chan",
        category=PlaceCategory.ATTRACTION,
        coast_type=CoastType.INLAND,
        lat=-8.1026,
        lon=-79.0772,
        address="Carretera a Huanchaco Km 5",
        source="manual",
    ),
    Place(
        osm_id=1004,
        name="Huacas del Sol y de la Luna",
        category=PlaceCategory.ATTRACTION,
        coast_type=CoastType.INLAND,
        lat=-8.1589,
        lon=-78.9978,
        address="Valle de Moche",
        source="manual",
    ),
    Place(
        osm_id=1005,
        name="Puerto Chicama (Malabrigo)",
        category=PlaceCategory.ATTRACTION,
        coast_type=CoastType.COASTAL,
        lat=-7.8447,
        lon=-79.4476,
        address="Malecón de Puerto Malabrigo",
        source="manual",
    ),
    Place(
        osm_id=1006,
        name="Marcahuamachuco",
        category=PlaceCategory.ATTRACTION,
        coast_type=CoastType.INLAND,
        lat=-7.8122,
        lon=-78.0519,
        address="Huamachuco, Sánchez Carrión",
        source="manual",
    ),
]

def seed() -> None:
    settings = Settings()
    engine = create_engine(settings.database_url)
    session_factory = make_session_factory(engine)
    with session_factory() as session:
        repo = PlaceRepo(session)
        count = repo.upsert_many(CANONICAL_PLACES)
        session.commit()
        print(f"Upserted {count} canonical tourist places.")

if __name__ == "__main__":
    seed()
