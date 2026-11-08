# ADR 0001: Transición de Monolito por Capas Técnicas a Modular Monolith

- **Fecha**: 2026-11-08
- **Estado**: Aceptado e Implementado

## Contexto

Originalmente, `lalibertad_predict` aplicaba Arquitectura Hexagonal organizada horizontalmente por **capas técnicas** (`src/turismo/domain`, `src/turismo/application`, `src/turismo/infrastructure`, `src/turismo/interfaces`). Aunque la separación entre lógica pura e infraestructura era correcta, cualquier funcionalidad nueva obligaba a modificar simultáneamente archivos centrales (`domain/models.py`, `domain/scoring.py`, `application/services.py`, `infrastructure/db/models.py`, `infrastructure/db/repositories.py` y `interfaces/api/main.py`). En trabajo colaborativo en equipo, esto generaba conflictos constantes de merge.

## Decisión

Reorganizar el sistema como un **Modular Monolith** orientado a contextos de negocio (Bounded Contexts), conservando las capas hexagonales (`domain`, `application`, `infrastructure`, `api`) dentro de cada módulo:

1. **Módulos de negocio independientes (`src/turismo/`)**:
   - `places/`: Catálogo de lugares turísticos y comerciales, clasificación declarativa, recolector OSM, enriquecedor Google/curado, recolector de imágenes WebP y `APIRouter` propio (`/places`).
   - `scoring/`: Motor determinista de conveniencia y recomendación, con **un archivo por factor** bajo `scoring/domain/factors/` implementando el protocolo común `ScoreFactor` (Principio Open/Closed), `weights.yaml` co-ubicado y `APIRouter` propio (`/scores`, `/calendar`).
   - `weather/`: Pronósticos meteorológicos y marinos (Open-Meteo).
   - `safety/`: Diagnóstico georreferenciado de seguridad ciudadana (MININTER / SIDPOL).
   - `events/`: Calendario festivo y cálculo de aglomeración.
   - `pricing/`: Tarifas históricas y medianas de hospedaje.
2. **Kernel compartido (`src/turismo/shared/`)**:
   - Contiene primitivas transversales (`config.py`, `geo.py`, `models.py`, `ports.py`, `db.py`, `http.py`, `collector.py`, `cache.py`, `schemas.py`, `deps.py`).
3. **Único Composition Root (`src/turismo/app/`)**:
   - Único paquete autorizado a ensamblar todos los módulos (`api.py` mediante `include_router`, `deps.py`, `cli.py` y `scheduler.py`).
4. **Compatibilidad hacia atrás sin roturas**:
   - Los módulos históricos (`turismo.domain.*`, `turismo.application.*`, `turismo.infrastructure.*`, `turismo.interfaces.*`) se mantienen como fachadas ligeras de re-exportación (`__all__`) que delegan en los nuevos paquetes modulares, garantizando cero roturas en scripts, migraciones o tests existentes.
5. **Verificación automatizada de fronteras y regresiones**:
   - Contratos `[tool.importlinter]` en `pyproject.toml` y tests AST en `tests/architecture/test_architecture_contracts.py` que fallan si el dominio importa infraestructura, si dos módulos hermanos se importan entre sí o si Alembic tiene más de un `head`.
   - Golden test (`tests/scoring/test_weights_golden.py`) que verifica el impacto numérico exacto de cualquier cambio en `weights.yaml`.

## Consecuencias

- **Positivas**: Cada desarrollador trabaja aislado en su módulo (`places`, `scoring`, `weather`, `frontend/src/features/*`) reduciendo drásticamente los conflictos de merge; agregar un nuevo factor de scoring consiste únicamente en crear un archivo en `scoring/domain/factors/` y registrarlo en `DEFAULT_FACTORS`.
- **Mitigación de riesgos**: La compatibilidad mediante fachadas de re-exportación evita romper integraciones previas durante la transición.
