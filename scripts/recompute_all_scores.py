from datetime import date, timedelta
from turismo.config import get_settings
from turismo.application.services import ScoringService
from turismo.infrastructure.db.repositories import (
    EventRepo,
    LocationRepo,
    MarineRepo,
    PlaceRepo,
    PriceRepo,
    ScoreRepo,
    VisitorsRepo,
    WeatherRepo,
)
from turismo.infrastructure.db.session import create_engine, make_session_factory

settings = get_settings()
engine = create_engine(settings.database_url)
factory = make_session_factory(engine)

start_date = date(2026, 11, 2)
for i in range(16):
    d = start_date + timedelta(days=i)
    with factory() as session:
        service = ScoringService(
            place_repo=PlaceRepo(session),
            location_repo=LocationRepo(session),
            weather_repo=WeatherRepo(session),
            marine_repo=MarineRepo(session),
            event_repo=EventRepo(session),
            visitors_repo=VisitorsRepo(session),
            price_repo=PriceRepo(session),
            score_repo=ScoreRepo(session),
            weights_path=settings.weights_file,
        )
        scores = service.compute_scores(query_date=d)
    print(f"Computed scores for {d}: {len(scores)} places.")

engine.dispose()
print("All 16 days precomputed successfully!")
