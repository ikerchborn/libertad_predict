# Avances y cambios importantes

Este archivo registra cambios de producto y arquitectura que alteran el flujo del
usuario o la forma de mantener el sistema. No sustituye el historial de Git ni
registra cambios pequeños de formato.

## 2026-11-09

### Interacción y trazos del mapa

- Se habilitaron el zoom con rueda y gesto táctil, y se elevaron los controles de
  Leaflet para que los avisos no bloqueen acercar/alejar.
- Se corrigió la visualización del mapa en Explorar para móvil y tableta; los
  controles de navegación ya no quedan debajo del encabezado y el mapa conserva
  sus controles de Leaflet al abrirse y cerrarse en pantalla completa.
- La opción «Lugares» se movió al encabezado como acceso «+ Lugares» a Explorar;
  al usarla se muestran más resultados. Las tarjetas del catálogo ahora apilan
  sus acciones para evitar comprimir los nombres en columnas estrechas.
- Se compactó el encabezado móvil del viaje, se evitó que la navegación tape el
  resumen y se quitó el acceso duplicado a Lugares del menú móvil.
- Se eliminó el espacio innecesario bajo el encabezado en móviles para que la
  navegación del viaje quede inmediatamente debajo.
- Explorar y «+ Lugares» mantienen visible el catálogo incluso si se activó
  Modo Viaje desde el itinerario.
- Al iniciar un viaje desde la portada, el planificador abre desde el inicio de
  la página para evitar que el mapa quede fuera de vista en pantallas pequeñas.
- Los tramos de transporte sin geometría propia solicitan ahora una ruta vial a
  OSRM en vez de dibujar automáticamente una línea recta. El aviso distingue
  este trazado estimado de la ruta real no confirmada del micro.

### Iconos vectoriales para transporte en el mapa

- Se reemplazaron los emojis de micro y taxi en los marcadores de subida y bajada
  por iconos SVG vectoriales, manteniendo las etiquetas, códigos, colores y
  acciones de selección.
- Los iconos se generan con SVG en el navegador y no agregan dependencias.

### Caminatas cortas y mapa ocultable

- Los recorridos entre destinos cercanos intentan obtener geometría peatonal de
  OSRM incluso cuando la distancia directa es menor a 300 m. El mapa muestra el
  trazado por calles con un icono peatonal circular y su métrica; si OSRM no
  responde, conserva el fallback existente, marcado como aproximado.
- Al ocultar el mapa en escritorio, el área del itinerario se expande para
  aprovechar el espacio liberado.
- La exploración ya no agrupa marcadores: muestra un icono vectorial individual
  por lugar y pines numerados para las paradas del itinerario activo.
- Se retiró la sección Notas del Viaje. Al añadir lugares desde Explorar, se
  muestran directamente los días del viaje actual, sin listar otros viajes.
- Se separaron Resumen, Explorar e Itinerario como vistas independientes. El
  resumen contiene indicadores y desglose de días; Explorar mantiene catálogo y
  mapa, con opciones para guardar en Por visitar o añadir al día del viaje
  activo. La lista Por visitar se persiste por viaje.

### TSDoc y responsabilidades en `frontend/src/lib`

- Se revisaron los módulos TypeScript de la biblioteca frontend, incluidos
  `transportImages.ts`, `server-api.ts`, `routeOptimizer.ts`, clientes HTTP,
  URLs seguras y servicios de OSRM/transporte.
- Se añadieron cabeceras de responsabilidad y TSDoc a contratos/exportaciones
  públicas para explicar límites, fallbacks, efectos y condiciones de retorno;
  las suites `.test.ts` describen su cobertura en el propio archivo.
- Build de producción pasó, Vitest 11/11 y ESLint sin errores (reportó 19
  advertencias).

### TSDoc para los contratos compartidos del frontend

- Se documentaron en el propio código todos los tipos, interfaces, constantes
  y funciones exportados por `frontend/src/lib/types.ts`, incluyendo el contrato
  de nulabilidad/enriquecimientos de `Place` y los umbrales de clasificación
  del mapa de calor.
- Validación: compilación TypeScript mediante `npm --prefix frontend run build`.

### Separación del servicio multimodal por responsabilidades

- Se dividió `transitService.ts` en módulos para tipos, política peatonal,
  datos/normalización de catálogos, selección Truxdi, geometría, enriquecimiento
  de fichas, rutas de respaldo y coordinación pública. `transitService.ts`
  sigue siendo la fachada compatible, así que los consumidores existentes no
  requieren cambios.
- Los módulos de implementación quedan entre 13 y 429 líneas; se añadieron
  TSDoc a contratos públicos y pruebas a las funciones expuestas.
- Se documentó la arquitectura del servicio en `frontend/README.md`.
- Validación: build de producción pasó; Vitest 11/11; ESLint sin errores
  (19 advertencias existentes).

### Corrección de altura del mapa Leaflet

- Se hizo flexible el canvas para que aproveche toda la altura disponible del
  panel y no deje una zona blanca debajo de los mosaicos.
- Se mantiene la altura natural del mapa cuando el contenedor no está expandido.
- Validación: build de producción y verificación en navegador a distintos
  tamaños de ventana.

### Remediación de auditoría técnica y verificación integral

- Se acotó la caché FastAPI por cantidad y bytes, se agruparon consultas de
  lugares y se restringieron CORS y cabeceras; la CSP de Next.js se dejó en
  modo `Report-Only`.
- Se difirió la carga del catálogo urbano, se añadió caché y límite por proceso
  al endpoint de tarifas, y se fijaron límites y progreso/cancelación para
  optimizar itinerarios.
- Las rutas OSRM ahora tienen timeout de 4 s, validación de geometría y aviso
  visible cuando el trazado es aproximado. Se desacopló la actualización de
  segmentos del ciclo de vida principal de Leaflet y se añadió agrupación de
  marcadores.
- Se añadieron pruebas unitarias para caché, configuración, OSRM, optimización
  y transporte, y se actualizó la guía de validación en `README.md`.
- Verificación: build de producción pasó; Vitest 7/7; pytest 79/79; Ruff pasó;
  ESLint terminó sin errores (19 advertencias); auditoría de dependencias de
  producción reportó 0 vulnerabilidades. En navegador se comprobó el mapa,
  itinerario de tres destinos, selección de lugar, ficha de transporte y cierre.
  La API respondió correctamente y el rate limit local dio 60 respuestas 200 y
  la solicitud 61 con 429.
- Pendientes conocidos: validar el perfil peatonal de OSRM; migrar rate limit a
  almacenamiento compartido para múltiples instancias; revisar CSP antes de
  imponerla; automatizar el flujo E2E y abortar solicitudes ya iniciadas al
  cancelar una optimización.

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
