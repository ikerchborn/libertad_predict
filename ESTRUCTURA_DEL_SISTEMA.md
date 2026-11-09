# Estructura y Funcionamiento del Sistema: Turismo La Libertad (Modular Monolith)

Este documento describe la arquitectura **Modular Monolith** con capas hexagonales por módulo de negocio, los flujos de datos y el funcionamiento interno del sistema **Turismo La Libertad** (también disponible en [docs/architecture.md](./docs/architecture.md) junto con el [ADR 0001](./docs/adr/0001-modular-monolith-architecture.md)).

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
        ├── app/                           # Rutas Next.js, layouts y estilos globales
        ├── components/                    # HomePlacesClient, PlaceMap, fichas y planificador
        ├── hooks/                         # Estado/persistencia del viaje (useTripCache)
        ├── lib/                           # API, tipos, OSRM, optimización y transporte
        └── data/                          # Snapshot y adiciones de catálogo
```

---

## 3. Mapa Interactivo: Componentes, Datos y Flujo

El mapa del planificador usa **Leaflet** y mosaicos de OpenStreetMap. Su lógica cartográfica reside en `frontend/src/components/PlaceMap.tsx`; el estado del viaje, la selección y la ficha viven en `frontend/src/components/HomePlacesClient.tsx`. La implementación es deliberadamente distinta del repositorio de referencia LibertadGO: el mapa de este sistema visualiza tramos calculados de caminata, transporte público y taxi, no solo una línea conectando destinos.

### Archivos y responsabilidades

| Archivo | Responsabilidad en el mapa |
|---|---|
| `frontend/src/components/HomePlacesClient.tsx` | Mantiene selección de lugar y transporte, día activo, filtro de categoría, crea los datos de ruta y muestra la ficha lateral. Pasa al mapa `routePlaces`, `routeSegments`, `catalogPlaces`, `catalogKind` y callbacks de selección. |
| `frontend/src/components/PlaceMap.tsx` | Inicializa Leaflet, mosaicos, capas y marcadores; dibuja geometrías y etiquetas; responde a selección de lugar/tramo y ofrece controles de encuadre. |
| `frontend/src/lib/transitService.ts` | Resuelve opciones de transporte, paraderos, caminatas de acceso y alternativa taxi cuando el acceso peatonal supera el umbral. |
| `frontend/src/lib/osrmService.ts` | Solicita geometría vial a OSRM para perfil a pie o automóvil y devuelve una traza directa aproximada si OSRM falla. |
| `frontend/src/hooks/useTripCache.ts` | Mantiene y persiste los viajes y días; `addPlaceToDay` evita agregar de nuevo una parada ya presente en el día. |
| `frontend/src/app/globals.css` | Controla el tamaño responsivo del lienzo Leaflet, el foco de marcador, las etiquetas y la atenuación/ocultamiento de tramos no seleccionados. |
| `frontend/src/data/places_snapshot.json` y `frontend/src/data/places_additions.json` | Snapshot de catálogo y registros complementarios que recibe el frontend. |

### Flujo de datos

1. `HomePlacesClient` obtiene el catálogo (`initialPlaces`) y el itinerario del día activo (`activeDay.places`).
2. Al calcular el itinerario, usa `resolveTransitBetweenPlaces`/`getTransitBetweenPlaces` y `fetchOsrmRoute` para generar segmentos con tipo, coordenadas, color, código de línea, duración, tarifa y paraderos.
3. Envía a `PlaceMap` el catálogo completo, el filtro `listCategory`, las paradas del día, los segmentos, el hospedaje base y las funciones callback.
4. `PlaceMap` inicia Leaflet con `setView`, crea capas de lugares y de itinerario, dibuja las geometrías y ajusta la vista inicial. Para limitar el ruido, los marcadores adicionales del catálogo solo se muestran a 10 km o menos de alguna parada activa (o del lugar central si el día no tiene paradas).
5. Al pulsar un marcador del catálogo o itinerario, `onSelectPlace` activa `handleMapPlaceSelect`; el cliente carga detalles mediante `fetchPlaceById` y presenta la ficha con el selector de viaje/día. La acción usa `addPlaceToDay` y no crea duplicados en el mismo día.
6. Al pulsar una línea o pin de transporte, `onSelectTransitRoute` activa `handleMapTransitSelect` y muestra la ficha técnica del servicio. Seleccionar una caminata o un tramo cambia `selectedLegId`, atenúa otras geometrías y ajusta el mapa al tramo activo.

### Tipos de marcadores y comportamiento

- **Paradas del itinerario:** número en orden y pictograma según el tipo de lugar; al pulsarlas se abre la ficha del lugar.
- **Catálogo seleccionable:** pictograma y color por categoría (`attraction`, `lodging`, `food`, `activity` o sin clasificar). El filtro de categoría actual controla qué iconos se dibujan; los lugares ya representados por marcadores principales o de itinerario se excluyen para reducir superposición.
- **Lugar principal, lugares cercanos y hospedaje base:** marcadores diferenciados con acciones que abren la ficha de lugar.
- **Transporte colectivo:** pines de abordaje/descenso y polilínea seleccionables que abren la ficha de la línea.
- **Taxi:** los pines se presentan como punto de recojo y destino; la ficha usa tarifa estimada en rango, no una tarifa fija.
- **Caminata:** indicador centrado en la geometría, con distancia y duración estimada; permite enfocar el tramo.
- **Lugar seleccionado:** el mapa vuela a sus coordenadas y aplica un halo visual mediante la clase `map-place-focused`.

Los marcadores de catálogo y los pines de lugares aceptan interacción por teclado. Los controles **Itinerario** y **Vista general** encuadran las paradas y segmentos del día activo o restauran la vista capturada al terminar la carga inicial, respectivamente. **Ampliar mapa** habilita la vista de pantalla completa; `ResizeObserver` invalida las dimensiones Leaflet al cambiar el tamaño.

### Límites a tener en cuenta

- Una geometría OSRM puede ser una ruta aproximada si el servicio público falla; la interfaz debe mantener esa distinción y no presentarla como una traza verificada.
- La vista del catálogo es intencionalmente local al itinerario: los puntos que están a más de 10 km no aparecen como marcadores adicionales, aunque sigan disponibles en el catálogo y en la lista de lugares.
- El mapa muestra rutas calculadas por la lógica de transporte disponible; no es una aplicación de navegación paso a paso ni garantiza tiempos, tarifas o disponibilidad actual del servicio.

---

## 4. El Motor de Scoring Modular (`turismo.scoring`)

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

## 5. Ciclo Operativo y Verificación

```powershell
# Ejecutar linter, type-check estricto y tests (incluyendo contratos de arquitectura y golden test)
.\.venv\Scripts\python -m ruff check src/ tests/
.\.venv\Scripts\python -m mypy --strict src tests
.\.venv\Scripts\python -m pytest -q

# Iniciar API Backend y Frontend
.\.venv\Scripts\python -m turismo api
npm --prefix frontend run dev
```
