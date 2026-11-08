## Resumen

Describe brevemente qué problema resuelve este PR y en qué módulo de negocio actúa.

## Módulo(s) afectado(s)

- [ ] `places` (catálogo, clasificación, OSM, enricher, imágenes)
- [ ] `scoring` (factores `ScoreFactor`, motor de scoring, `weights.yaml`)
- [ ] `weather` (Open-Meteo clima y oleaje)
- [ ] `safety` (MININTER / SIDPOL)
- [ ] `events` (calendario festivo)
- [ ] `pricing` (tarifas de hospedaje)
- [ ] `shared` / `app` (kernel compartido o composition root)
- [ ] `frontend` (`features/places`, `features/map`, `features/planner`, `features/calendar`, `shared`)
- [ ] `migrations` (Alembic)

## Checklist de Calidad y Arquitectura

- [ ] La rama sigue el prefijo del módulo (`feat/<modulo>-...`, `fix/<modulo>-...`) y los commits usan Conventional Commits (`feat(scoring): ...`).
- [ ] El dominio (`<modulo>/domain/`) se mantiene puro y sin dependencias de infraestructura.
- [ ] Ningún módulo de negocio importa directamente a otro módulo hermano (verificado por `tests/architecture/test_architecture_contracts.py`).
- [ ] Si se agregó una migración de Alembic, existe un único `head` (`alembic heads`).
- [ ] Si se modificó `weights.yaml`, `config/weights.yaml` y `src/turismo/scoring/weights.yaml` están sincronizados y el golden test (`tests/scoring/test_weights_golden.py`) refleja el impacto numérico esperado.
- [ ] `ruff check src/ tests/`, `mypy --strict src tests` y `pytest` pasan en verde.
