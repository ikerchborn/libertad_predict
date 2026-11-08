# Turismo La Libertad

Sistema de planeamiento tur?stico para el departamento de La Libertad, Per?, orientado a ayudar a viajeros, familias y profesionales a decidir donde ir, cu?ndo ir y qu? tan conveniente es un destino en funci?n de clima, seguridad, distancia, afluencia, servicios y transporte.

La aplicaci?n combina una base de datos local como fuente de verdad, un backend en Python/FastAPI y una interfaz web en Next.js con mapas OpenStreetMap. El objetivo es ofrecer recomendaciones deterministas, ?tiles en ruta y sin depender de llamadas externas durante la navegaci?n del usuario.

## Que incluye?

- Calculo de conveniencia y scoring por lugar
- Diagnostico de seguridad georreferenciado
- Pronostico climitico y oceinico
- Informaci?n de eventos y afluencia tur?stica
- Cat?logo de lugares, hoteles, actividades y comida
- Planificador multi-d?a con transporte p?blico local
- Mapa interactivo con tiles OpenStreetMap
- Datos locales y snapshots inmutables para evitar depender de APIs externas en tiempo real

## Arquitectura

- Backend: Python 3.11+, FastAPI, SQLAlchemy, Alembic
- Frontend: Next.js 16, React 19, Leaflet + OpenStreetMap
- Base de datos: SQLite local (`data/turismo.db`)
- Origen de datos: OSM, datasets locales, snapshots, MINCETUR, MININTER y otros recursos descargados/normalizados previo a la ejecuci?n

## Requisitos

- Python 3.11+
- Node.js 20+
- npm
- Entorno virtual recomendado (`.venv`)

## Inicio r?pido

### 1) Crear entorno virtual e instalar dependencias

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -e ".[dev]"
```

### 2) Preparar la base de datos

```powershell
.venv\Scripts\python -m turismo migrate
.venv\Scripts\python -m turismo seed-places-once
.venv\Scripts\python -m turismo collect-images
.venv\Scripts\python -m turismo seed-safety
.venv\Scripts\python -m turismo score
```

### 3) Ejecutar el backend

```powershell
.venv\Scripts\python -m turismo api
```

La API queda disponible en `http://127.0.0.1:8000` por defecto.

### 4) Ejecutar el frontend

```powershell
cd frontend
npm install
npm run dev
```

La app web queda disponible en `http://localhost:3000`.

## Comandos ?tiles

```powershell
# Directorio ra?z
.venv\Scripts\python -m turismo migrate
.venv\Scripts\python -m turismo api
.venv\Scripts\python -m turismo scheduler
.venv\Scripts\python -m turismo run
.venv\Scripts\python -m turismo collect osm
.venv\Scripts\python -m turismo collect open_meteo
.venv\Scripts\python -m turismo collect events
.venv\Scripts\python -m turismo collect mincetur
.venv\Scripts\python -m turismo collect hotel_prices
.venv\Scripts\python -m turismo score [YYYY-MM-DD]
```

## Estructura del proyecto

```text
.
??? data/                          # SQLite y snapshots locales
??? src/turismo/                  # C?digo del backend y l?gica de dominio
?   ??? application/
?   ??? domain/
?   ??? infrastructure/
?   ??? interfaces/
??? frontend/                     # Aplicaci?n web Next.js
?   ??? public/
?   ??? src/
??? scripts/                      # Utilidades y validaciones
??? tests/                        # Pruebas unitarias e integraci?n
??? config/                       # Configuraci?n YAML
??? alembic.ini                   # Migraciones SQLAlchemy
??? pyproject.toml                # Configuraci?n del proyecto Python
??? README.md                     # Este documento
??? ATTRIBUTION.md                # Cr?ditos y licencias
??? DESTINOS_FUERA_DE_TRUJILLO.md # Documentaci?n adicional
```

## Validaci?n y calidad

Desde la ra?z del repositorio:

```powershell
.venv\Scripts\python -m pytest
.venv\Scripts
uff check src/ tests/
.venv\Scripts\python -m mypy --strict src tests
```

Frontend:

```powershell
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Notas de funcionamiento

- La base de datos local (`data/turismo.db`) act?a como fuente de verdad.
- La aplicaci?n est? pensada para ofrecer recomendaciones ?tiles sin requerir un flujo de navegaci?n dependiente de terceros en tiempo real.
- El planificador multi-d?a conserva viajes y paradas en el navegador para evitar sobrecargar la base de datos central.
- El proyecto usa tiles libres de OpenStreetMap y recursos locales para ofrecer mejor desempe?o en entornos con conectividad limitada.

## Estado actual

Este repositorio ya incluye:

- backend FastAPI con modelos y repositorios
- pipelines de ingesti?n y enriquecimiento local
- recolectores de clima, eventos, turismo y seguridad
- frontend visual para mapas, detalle de lugares y planificaci?n
- documentaci?n para despliegue y ejecuci?n local

Para tareas de desarrollo m?s espec?ficas, consulta las carpetas de `src/turismo` y `frontend/src` o usa los scripts del directorio `scripts/`.
