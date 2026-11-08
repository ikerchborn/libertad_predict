# Estructura y Funcionamiento del Sistema: Turismo La Libertad (Modular Monolith)

Este documento describe la arquitectura **Modular Monolith** con capas hexagonales por módulo de negocio, los flujos de datos y el funcionamiento interno del sistema **Turismo La Libertad** (también disponible en [`docs/architecture.md`](file:///c:/Users/resan/Downloads/Development/worksalign/lalibertad_predict/docs/architecture.md) junto con el ADR en [`docs/adr/0001-modular-monolith-architecture.md`](file:///c:/Users/resan/Downloads/Development/worksalign/lalibertad_predict/docs/adr/0001-modular-monolith-architecture.md)).

---

## 1. Visión General del Sistema

**Turismo La Libertad** es una plataforma de planeamiento y recomendación turística inteligente para el departamento de La Libertad, Perú (Trujillo, Huanchaco, Otuzco, Pacasmayo, Huamachuco, etc.).

Su propósito es responder tres preguntas fundamentales para viajeros, familias y turistas:
1. **¿A dónde ir?** (Lugares de interés, playas, patrimonio cultural, gastronomía y alojamiento).
2. **¿Cuándo ir?** (Identificación de mejores fechas según clima, oleaje, afluencia y eventos).
3. **¿Qué tan conveniente y seguro es el destino?** (Evaluación multidimensional determinista de conveniencia y riesgo).

### Principios de Diseño
- **Modular Monolith por Contexto de Negocio:** Cada contexto (`places`, `scoring`, `weather`, `safety`, `events`, `pricing`) tiene sus propias capas hexagonales (`domain`, `application`, `infrastructure`, `api`), evitando que dos desarrolladores editen los mismos archivos al trabajar en distintas funcionalidades.
- **Un archivo por factor de scoring (Principio Open/Closed):** En `src/turismo/scoring/domain/factors/`, cada factor implementa el protocolo `ScoreFactor` (`weather.py`, `marine.py`, `calendar.py`, `seasonality.py`, `price.py`, `safety.py`, `external_rating.py`). `ScoringEngine` itera sobre la lista de factores registrados.
- **`app/` como único Composition Root:** Los módulos de negocio no se importan entre sí; solo `src/turismo/app/` (`api.py`, `deps.py`, `cli.py`, `scheduler.py`) los ensambla.
- **Fronteras Verificadas por Máquina:** Reglas en `pyproject.toml` (`[tool.importlinter]`) y `tests/architecture/test_architecture_contracts.py` garantizan pureza del dominio, independencia entre módulos y un único `head` de Alembic.
- **Fuente de verdad local e inmutable:** Base de datos SQLite local (`data/turismo.db`, ignorada en Git) regenerable mediante `migrate` + `seed` desde `data/seeds/`.

---

## 2. Estructura del Repositorio

```text
lalibertad_predict/
├── .github/
│   ├── CODEOWNERS                         # Quién debe aprobar cambios en cada carpeta
│   ├── pull_request_template.md           # Plantilla de PR con checklist modular
│   └── workflows/ci.yml                   # Ruff + Mypy + Alembic Head + Pytest + Next.js Build
├── docs/
│   ├── architecture.md                    # Documentación de arquitectura
│   └── adr/
│       └── 0001-modular-monolith-architecture.md
├── pyproject.toml                         # Dependencias, Ruff, Mypy e import-linter contracts
├── alembic.ini                            # Configuración de migraciones
├── migrations/                            # Migraciones Alembic (verificado: único head)
├── config/                                # Configuración declarativa
│   ├── classification.yaml
│   ├── events.yaml
│   └── weights.yaml                       # Sincronizado con src/turismo/scoring/weights.yaml
├── src/turismo/
│   ├── shared/                            # Kernel compartido: config, geo (Haversine), db, http, cache, schemas
│   ├── places/                            # Módulo Places: sus propias capas hexagonales
│   │   ├── domain/                        # models.py, classification.py
│   │   ├── application/                   # ports.py
│   │   ├── infrastructure/                # models.py, repository.py, osm_collector.py, enricher.py, image_collector.py
│   │   └── api.py                         # APIRouter propio (/places, /places/{id}, /places/{id}/nearby)
│   ├── scoring/                           # Módulo Scoring: un archivo por factor + motor
│   │   ├── domain/
│   │   │   ├── models.py
│   │   │   └── factors/                   # base.py, weather.py, marine.py, calendar.py, seasonality.py, price.py, safety.py, external_rating.py, recommendation.py
│   │   ├── application/                   # ports.py, engine.py (ScoringEngine + ScoringService)
│   │   ├── infrastructure/                # models.py, repository.py, mincetur_collector.py
│   │   ├── weights.yaml                   # Pesos co-ubicados junto al módulo
│   │   └── api.py                         # APIRouter propio (/scores/{place_id}, /calendar)
│   ├── weather/                           # Open-Meteo, clima y oleaje
│   ├── safety/                            # MININTER / SIDPOL
│   ├── events/                            # Calendario festivo regional
│   ├── pricing/                           # Precios de hospedaje
│   └── app/                               # Composition Root: único lugar que conecta todo
│       ├── api.py                         # FastAPI: solo include_router de cada módulo
│       ├── deps.py
│       ├── cli.py
│       └── scheduler.py
├── tests/                                 # Espejo de src/ (tests/places, tests/scoring, tests/architecture...)
└── frontend/
    └── src/
        ├── features/                      # places, map, planner, calendar (cada uno autocontenido)
        ├── shared/                        # componentes UI y cliente API comunes
        └── app/                           # solo rutas (App Router)
```

---

## 3. El Motor de Scoring Modular (`turismo.scoring`)

El motor calcula la conveniencia turística diaria (0 a 100) iterando sobre instancias que cumplen el contrato `ScoreFactor`:

$$\text{Score} = 100 \times \frac{\sum (w_i \times f_i)}{\sum w_i}$$

- **`WeatherFactor` (`factors/weather.py`):** Confort térmico, lluvia, índice UV y viento.
- **`MarineFactor` (`factors/marine.py`):** Altura y período de ola para destinos costeros.
- **`CalendarFactor` (`factors/calendar.py`):** Penalización por fin de semana y nivel de aglomeración por eventos.
- **`SeasonalityFactor` (`factors/seasonality.py`):** Flujo mensual histórico de visitantes (MINCETUR).
- **`PriceFactor` (`factors/price.py`):** Tarifa hotelera relativa a la mediana histórica.
- **`SafetyFactor` (`factors/safety.py`):** Índice georreferenciado de seguridad ciudadana (MININTER).
- **`ExternalRatingFactor` (`factors/external_rating.py`):** Calificación verificada de establecimientos/atractivos.

---

## 4. Ciclo Operativo y Verificación

```powershell
# Ejecutar linter, type-check estricto y tests (incluyendo contratos de arquitectura y golden test)
.\.venv\Scripts\python -m ruff check src/ tests/
.\.venv\Scripts\python -m mypy --strict src tests
.\.venv\Scripts\python -m pytest -q

# Iniciar API Backend y Frontend
.\.venv\Scripts\python -m turismo api
npm --prefix frontend run dev
```
