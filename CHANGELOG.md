# Avances y cambios importantes

Este archivo registra cambios de producto y arquitectura que alteran el flujo del
usuario o la forma de mantener el sistema. No sustituye el historial de Git ni
registra cambios pequeños de formato.

## 2026-11-09

### Mapa del planificador: selección y adición de lugares

- Al elegir un lugar desde un marcador, el mapa lo enfoca y la ficha ofrece
  «Elegir viaje y día», igual que el catálogo. Si ya está en el día activo, la
  ficha lo indica.
- La selección del marcador usa un estado visual de foco y el mapa se desplaza
  suavemente a sus coordenadas.
- Las paradas se añaden mediante `addPlaceToDay`, que evita duplicar el mismo
  lugar dentro del día seleccionado.

### Navegación y controles del mapa

- Se añadieron controles para encuadrar las paradas y segmentos del día activo y
  volver a la vista general capturada tras la carga inicial.
- El lienzo del mapa se reajusta al cambiar el tamaño del contenedor.
- Los marcadores de catálogo y los pines de lugar soportan selección por teclado.

### Marcadores del catálogo y corrección de dimensiones

- `PlaceMap` recibe el catálogo y el filtro de categoría activo del planificador.
- Se muestran iconos seleccionables de lugares cercanos a las paradas, hasta
  10 km; las paradas ya representadas no se dibujan otra vez como pines de catálogo.
- Se corrigió el layout flex que dejaba una zona blanca debajo del mapa y hacía
  que el mapa ocupara solo la parte superior de su panel.

### Ampliación del catálogo turístico

- Se añadieron cuatro atractivos y treinta hospedajes identificados mediante
  OpenStreetMap; TripAdvisor no permitió verificar sus listados y rankings.
- `frontend/src/data/places_additions.json` alimenta el fallback de la web y
  `scripts/seed_places.py`; el seeder evita volver a insertar IDs OSM existentes.
- Las fichas nuevas no reciben puntuaciones o metadatos comerciales inventados.

### Transporte urbano y ficha de taxi

- Se reforzó el umbral de acceso a paraderos: si el acceso peatonal excede 800 m
  o no puede verificarse, se recomienda taxi directo.
- La ficha y los pines distinguen taxi de transporte colectivo; la tarifa se
  presenta como estimación de rango y la geometría solicitada para taxi usa el
  perfil de conducción de OSRM.

### Documentación del mapa y del proyecto

- Se actualizaron los README, la estructura del sistema, la arquitectura,
  atribuciones y la nota de destinos para describir el árbol y comportamiento
  implementados.
- Se documentaron los archivos, callbacks, capas, marcadores, servicios OSRM y
  límites del mapa, además de establecer este registro para cambios grandes.

## Registro de cambios grandes futuros

Al finalizar un cambio importante, agrega una entrada nueva al inicio de este
archivo con:

1. Fecha y nombre corto de la mejora.
2. Comportamiento nuevo o problema corregido.
3. Componentes, módulos o datos principales afectados.
4. Comprobaciones ejecutadas y su resultado; indica explícitamente si algo no se
   validó.

No agregues contraseñas, tokens, datos personales ni información sensible al
registro.
