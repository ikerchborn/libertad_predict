# Turismo La Libertad

Planificador y recomendador turístico para el departamento de La Libertad, Perú. La aplicación combina un backend en Python/FastAPI, una interfaz Next.js, una base de datos local y fuentes de datos normalizadas para ayudar a explorar destinos, consultar información útil y organizar itinerarios multi-día.

## Funcionalidades

- Catálogo de atractivos, hospedajes, restaurantes y actividades.
- Recomendaciones por lugar y fecha, clima, seguridad, eventos y precios.
- Planificador multi-día con persistencia local en el navegador.
- Mapa interactivo con selección de lugares, fichas, marcadores de catálogo y paradas numeradas.
- Itinerarios con tramos peatonales y de transporte; los tramos seleccionables muestran su información.
- Transporte público y alternativa de taxi cuando el acceso a pie a un paradero no es adecuado.

## Arquitectura

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy y Alembic.
- **Frontend:** Next.js 16, React 19 y Leaflet.
- **Base local:** SQLite (`data/turismo.db`).
- **Fuentes:** OpenStreetMap, snapshots locales, MINCETUR, MININTER, Open-Meteo y datasets regionales.

La arquitectura backend es un monolito modular organizado por contexto (`places`, `scoring`, `weather`, `safety`, `events` y `pricing`). El frontend está en `frontend/src`; los detalles están en [ESTRUCTURA_DEL_SISTEMA.md](./ESTRUCTURA_DEL_SISTEMA.md) y [architecture.md](./architecture.md).

## Inicio rápido

### Requisitos

- Python 3.11 o superior.
- Node.js y npm.
- PowerShell en los ejemplos siguientes.

### Instalar y preparar

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m turismo migrate
```

### Ejecutar backend y frontend

En una terminal, desde la raíz:

```powershell
.\.venv\Scripts\python -m turismo api
```

En otra terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

La interfaz queda en `http://localhost:3000`; la API local normalmente queda en `http://127.0.0.1:8000`.

## Validación

Desde la raíz del repositorio:

```powershell
.\.venv\Scripts\python -m ruff check src/ tests/
.\.venv\Scripts\python -m mypy --strict src tests
.\.venv\Scripts\python -m pytest -q
Set-Location frontend
npm run lint
npm run test
npm run build
```

El lint del frontend puede reportar advertencias preexistentes; distingue estas de errores que hagan fallar el comando.

## Datos y atribución

- La base `data/turismo.db` es local y no se versiona; preparar datos con las migraciones y herramientas de `turismo`.
- Los datos nuevos de lugares mantenidos manualmente para el frontend se encuentran en `frontend/src/data/places_additions.json`. El fallback del frontend los incorpora y `scripts/seed_places.py` puede sembrarlos en la base.
- Las adiciones de lugares de ese archivo están sustentadas en OpenStreetMap; no deben describirse como datos, puntuaciones o rankings de TripAdvisor.
- Los mapas usan cartografía de OpenStreetMap. Consulta [ATTRIBUTION.md](./ATTRIBUTION.md) para créditos y licencias.

## Documentación

- [Estructura y funcionamiento del sistema](./ESTRUCTURA_DEL_SISTEMA.md): arquitectura y mapa, con sus componentes, callbacks y datos.
- [Arquitectura](./docs/architecture.md): módulos backend y flujo frontend.
- [Avances y cambios importantes](./CHANGELOG.md): registro cronológico de cambios grandes y su validación.
- [Destinos fuera de Trujillo](./DESTINOS_FUERA_DE_TRUJILLO.md): atractivos regionales incluidos en el catálogo.
- [Atribuciones](./ATTRIBUTION.md): fuentes y licencias.

Actualiza `CHANGELOG.md` al cerrar un cambio grande —por ejemplo, una funcionalidad visible, un cambio de arquitectura, catálogo o transporte— e incluye fecha, alcance, archivos principales y validación. No es necesario registrar cambios menores de estilo o correcciones tipográficas.
