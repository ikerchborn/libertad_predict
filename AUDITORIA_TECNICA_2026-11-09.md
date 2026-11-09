# Auditoría técnica integral

**Fecha:** 2026-11-09  
**Alcance:** frontend Next.js/React/TypeScript/Leaflet, servicios de rutas y transporte, API local FastAPI, catálogos y pruebas disponibles.

## Resumen ejecutivo

No se encontró una clave privada expuesta ni un vector directo de XSS en los componentes revisados. Los endpoints de datos son de lectura, tienen validación de parámetros y limitación de 60 solicitudes por minuto en FastAPI. `npm audit --omit=dev` no reportó vulnerabilidades conocidas.

Los riesgos principales son de rendimiento y fiabilidad: el catálogo de rutas urbanas llega al cliente dentro de un chunk JavaScript de **4.61 MB sin comprimir (947 KB gzip)**; Leaflet reconstruye el mapa completo cuando cambian los segmentos; y los fallbacks de OSRM pueden dibujar conexiones directas aproximadas. También faltan cabeceras de seguridad HTTP y límites de memoria para la caché en proceso.

## Estado de remediación (2026-11-09)

La tabla de hallazgos siguiente describe el estado inicial de la auditoría. Este estado actualizado la sustituye para valorar qué queda pendiente:

| Hallazgo | Estado | Cambio aplicado y límite restante |
|---|---|---|
| H-01 — Catálogo de transporte en el bundle | Parcial | El catálogo urbano se carga con `import()` al necesitar cálculo multimodal, en vez de incorporarse al primer chunk. El JSON completo todavía se descarga cuando se requiere esa resolución; falta dividirlo/servirlo desde backend y fijar un presupuesto de bundle. |
| H-02 — Fallback OSRM parece ruta vial | Mitigado | Timeout de 4 s, geometría validada, motivo explícito del fallback, estilo aproximado discontinuo y aviso persistente en el mapa. No se verificó que el proveedor público OSRM tenga un perfil peatonal adecuado para Trujillo. |
| M-01 — Cabeceras de seguridad | Mitigado | Next.js envía cabeceras de seguridad y CSP `Report-Only`; HSTS queda limitado a producción. La CSP no se debe poner en modo enforcement hasta revisar telemetría y compatibilidad con Leaflet. |
| M-02 — Tarifa sin caché/límite | Mitigado en un proceso | Tarifa cacheada cinco minutos y límite por cliente de 60 solicitudes/minuto. Es memoria local al proceso; producción con varias instancias requiere rate limit compartido en proxy/servicio. |
| M-03 — Caché FastAPI sin límites | Corregido | Caché LRU con topes de entradas y bytes, expiración y exclusión de respuestas con autorización/cookies. |
| M-04 — Leaflet se reconstruye por segmentos | Mitigado | La instancia/capas base se separan de la actualización de rutas; cambios exclusivos de segmentos ya no reinician el mapa. |
| M-05 — Optimización sin límites ni progreso | Corregido con límite | Máximo de ocho paradas para optimizar, lotes con progreso y acción de cancelación. La cancelación invalida el resultado y evita nuevos lotes, pero no aborta solicitudes que ya estén en vuelo. |
| M-06 — Consultas N+1 de `/places` | Corregido | Filtros de zona/búsqueda en SQL y carga por lotes de detalles, clima y datos marinos. |
| M-07 — Radio de acceso inconsistente | Corregido | Umbral único de 800 m en la resolución peatonal, con helper y prueba de límite. |
| B-01 — Pines solapados/pequeños | Mitigado | Clustering seleccionable y objetivos de mapa de 44 px; se conservan los marcadores individuales al ampliar/separar el grupo. |

### Validación posterior a los cambios

- `npm --prefix frontend run test` — **7 pruebas pasaron** (optimizador, OSRM y transporte).
- `npm --prefix frontend run build` — **pasó**, incluyendo compilación TypeScript y build de producción.
- `npm --prefix frontend run lint` — **0 errores; 19 advertencias** de hooks, `<img>` y símbolos sin uso.
- `.\.venv\Scripts\python.exe -m pytest -q` — **79 pruebas pasaron**, 1 advertencia de deprecación de Starlette/httpx.
- `.\.venv\Scripts\ruff.exe check src\turismo\shared\cache.py src\turismo\shared\config.py src\turismo\places\api.py src\turismo\places\infrastructure\repository.py src\turismo\app\api.py tests\unit\test_cache.py tests\unit\test_config.py tests\integration\test_api.py` — **pasó**.
- `npm --prefix frontend audit --omit=dev` — **0 vulnerabilidades**.
- Smoke API local — `/places` respondió HTTP 200; CORS permitió `http://localhost:3000` y no expuso `Access-Control-Allow-Origin` a un origen no permitido.
- Rate limit local — **60 solicitudes HTTP 200 y la solicitud 61 HTTP 429** desde la misma clave de cliente.
- Navegador Playwright manual — se creó un itinerario, se agregaron tres destinos, se calcularon dos tramos multimodales y se dibujaron marcadores ordenados, caminatas y transporte. Seleccionar una línea colectiva abrió la ficha con empresa, tarifa, frecuencia, hitos y tiempos; cerrar la ficha restauró el mapa. Seleccionar un pin abrió la ficha del lugar. En esta ruta de prueba no hubo errores JavaScript.

### Riesgos/pendientes que permanecen

1. El rate limit y la caché del handler de tarifa viven en memoria por instancia; definir coordinación distribuida para despliegues con varias réplicas.
2. CSP permanece en `Report-Only`; recolectar/revisar reportes antes de hacerla cumplir y endurecer estilos inline gradualmente.
3. La validez de rutas peatonales del OSRM público no está demostrada. Los fallbacks siguen siendo aproximaciones y se identifican como tales.
4. El botón de cancelación no cancela solicitudes de red que ya comenzaron; solo evita resultados obsoletos y lotes nuevos.
5. El flujo de navegador fue una verificación manual con Playwright, no una suite E2E persistida en el repositorio. Automatizar agregar → optimizar → seleccionar tramo → abrir/cerrar ficha.

## Hallazgos priorizados

| ID | Severidad | Área | Hallazgo |
|---|---|---|---|
| H-01 | Alta | Rendimiento | Catálogo de transporte de 9.5 MB incorporado al bundle cliente. |
| H-02 | Alta | Fiabilidad / UX | Un fallo de OSRM se convierte en una línea directa aproximada; el consumidor puede interpretarla como ruta vial. |
| M-01 | Media | Seguridad defensiva | No se configuran CSP ni otras cabeceras de seguridad en Next.js. |
| M-02 | Media | Disponibilidad | El handler de tarifa no tiene rate limit y vuelve a leer y parsear el catálogo por cada solicitud. |
| M-03 | Media | Disponibilidad | La caché de respuestas FastAPI no limita ni elimina las entradas vencidas. |
| M-04 | Media | Rendimiento | Recalcular segmentos desmonta y crea otra vez la instancia completa de Leaflet. |
| M-05 | Media | Rendimiento | El optimizador consulta pares de paradas en cuadrático y no limita el tamaño del itinerario. |
| M-06 | Media | Rendimiento API | `/places` puede cargar hasta 500 registros y consultar detalles/clima dentro de un bucle. |
| M-07 | Media | Lógica de producto | El radio efectivo es 900 m, aunque el aviso y el criterio de producto dicen 800 m. |
| B-01 | Baja | UX / a11y | Los pines turísticos del Centro se superponen; varias etiquetas del mapa rondan los 10 px. |

### H-01 — El catálogo de transporte infla el bundle cliente

`transitService.ts` importa directamente `rutas_trujillo.json`. El archivo pesa **9,494,875 bytes** y contiene 137 rutas, 8,095 referencias a paraderos y 94,783 puntos de geometría. En el build inspeccionado, un chunk que contiene ese catálogo pesa **4,605,482 bytes raw / 947,126 bytes gzip**. Se descarga y analiza como JavaScript aunque el usuario no esté consultando esas rutas.

**Causa e impacto:** la importación estática fuerza el conjunto completo de rutas al bundle de la aplicación cliente. Aumenta descarga, parseo, memoria y tiempo hasta la interactividad, especialmente en móvil.

**Acción:** trasladar el cálculo del catálogo a una API/servidor o separar los datos por región/corredor y cargarlos bajo demanda. Simplificar geometrías para visualización y establecer un presupuesto de tamaño de bundle verificado en CI.

### H-02 — La ruta aproximada puede parecer una ruta de calles

`fetchOsrmRoute` usa un timeout de 6 segundos y, ante cualquier error, devuelve los waypoints originales unidos directamente y una distancia Haversine. El resultado sí lleva `isFallback`, pero la ruta resultante sigue dibujándose y el tooltip de mapa no comunica explícitamente que no sigue calles. En una consulta pública de muestra, los perfiles `foot` y `driving` de OSRM devolvieron la misma distancia y número de puntos; esto no valida que el perfil peatonal represente una red peatonal distinta.

**Causa e impacto:** el fallback conserva una forma de resultado exitosa aunque no exista geometría vial. Una línea diagonal puede cruzar recintos, propiedades o zonas sin acceso y dar una falsa impresión de navegación.

**Acción:** distinguir en UI el estado «ruta aproximada/no validada» y no describirlo como traza vial. Validar que el proveedor realmente soporte los perfiles solicitados; si la precisión peatonal es requisito, usar un backend/proveedor con perfil peatonal comprobado. Añadir caché, límites de concurrencia y un timeout acorde al presupuesto de interacción.

### M-01 — No hay cabeceras de seguridad web configuradas

No se encontró una función `headers()` en `next.config.ts` ni configuración equivalente en el layout. Por tanto, el código de la aplicación no establece CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` o una política HSTS.

**Causa e impacto:** el navegador no recibe una defensa en profundidad explícita contra carga de recursos no autorizados, interpretación MIME incorrecta o exposición innecesaria del referer. No se observó un XSS explotable en la revisión, así que esto es una brecha preventiva, no evidencia de explotación.

**Acción:** desplegar primero una CSP en modo `Report-Only` y ajustar sus orígenes para la API, OSRM y tiles OSM. Mantener `object-src 'none'`, `base-uri 'self'` y `frame-ancestors 'none'`; endurecer estilos con nonce cuando sea viable, ya que el mapa usa estilos inline. Añadir el resto de cabeceras en Next.js o en el proxy de producción. Confirmar CORS con los dominios productivos exactos.

### M-02 — Endpoint de tarifa sin limitación de solicitudes

`frontend/src/app/api/transit/fare/route.ts` expone un `GET` sin parámetros, pero cada llamada lee y parsea `prueva_maps/Trujillo-OMUS/data.json` (407,389 bytes). El handler no tiene rate limiting ni caché de resultado.

**Causa e impacto:** no hay SSRF ni entrada arbitraria en este handler, pero un cliente puede repetir trabajo de disco y parseo sin límite en el proceso Next.js.

**Acción:** validar el catálogo durante build/inicio, cachear la tarifa en memoria, devolver `Cache-Control` adecuado y aplicar limitación en el proxy/servidor. No hace falta un límite de payload porque el endpoint no recibe cuerpo.

### M-03 — Caché FastAPI con cardinalidad no acotada

`ResponseCacheMiddleware` guarda el cuerpo de cada GET bajo la ruta y query completa, con TTL de 300 segundos. No hay máximo de entradas ni limpieza de claves vencidas al insertar nuevas; la expiración solo se comprueba al consultar esa misma clave.

**Causa e impacto:** consultas distintas pueden acumular claves y cuerpos en memoria durante la vida del proceso. El rate limit por IP ayuda, pero no controla cardinalidad distribuida ni borra entradas antiguas.

**Acción:** usar una caché con tamaño máximo/evicción y expiración real (por ejemplo LRU o Redis), normalizar parámetros y excluir respuestas que no deban compartirse. Medir bytes y claves, no solo el TTL.

### M-04 — Ciclo de vida de Leaflet demasiado amplio

El efecto de inicialización de `PlaceMap` depende de `routeSegments`. Su cleanup elimina el mapa y la siguiente ejecución construye otra instancia, con nuevas capas, marcadores y carga de tiles.

**Causa e impacto:** cada actualización de geometría reconstruye también el lienzo base. Puede causar parpadeos, pérdida de viewport, repetición de solicitudes de tiles y costo innecesario de DOM; la limpieza actual sí remueve la instancia y no apunta por sí sola a una fuga permanente.

**Acción:** mantener estable la instancia Leaflet y separar capas base, catálogo, itinerario y segmentos. Actualizar o reemplazar solo las capas que cambiaron; invalidar dimensiones al cambiar el layout en lugar de recrear el mapa.

### M-05 — Optimización y solicitudes sin límite por tamaño de día

`handleOptimize` genera todos los pares ordenados de paradas (n·(n−1)) y resuelve las consultas en lotes secuenciales de cuatro. `optimizeDayRoute` construye una matriz O(n²), prueba múltiples inicios de vecino más cercano y ejecuta 2-opt hasta 60 iteraciones. No hay un máximo de paradas documentado o aplicado.

**Causa e impacto:** el crecimiento del itinerario multiplica llamadas de OSRM y tiempo de CPU. Los tiempos pueden crecer mucho cuando varios pares esperan el timeout de seis segundos.

**Acción:** fijar y validar un límite de paradas por día, optimizar primero una matriz acotada/caché de tiempos, descartar pares irrelevantes y cancelar consultas obsoletas. Mostrar progreso y permitir cancelar el cálculo.

### M-06 — Consulta de catálogo con patrón N+1

`/places` puede consultar hasta 500 filas cuando hay filtro de zona o texto. Dentro del bucle de resultados carga el detalle de cada lugar y consulta clima/mar para cada uno.

**Causa e impacto:** una sola petición HTTP puede multiplicar accesos a base de datos. El rate limit controla frecuencia por IP, no el costo de cada petición.

**Acción:** obtener detalles y datos meteorológicos por lote con joins/consultas agrupadas; limitar primero el conjunto candidato y paginar antes del enriquecimiento. Añadir prueba de rendimiento con 500 lugares.

### M-07 — Umbral de acceso a paraderos inconsistente

Las constantes de `transitService.ts` son `0.9` km, mientras que los avisos al usuario dicen «más de 800 m» y el criterio solicitado fue rechazar caminatas mayores a 800 m. La lógica compara la distancia al paradero con esas constantes.

**Causa e impacto:** se pueden recomendar micros con un acceso peatonal de 801–900 m pese a comunicar un umbral de 800 m.

**Acción:** acordar un solo umbral de producto, expresarlo en metros y usarlo en búsqueda, fallback, textos y pruebas de límites (799/800/801 m).

### B-01 — Pines solapados y baja legibilidad

En una ejecución de navegador se generaron pines de las categorías (24 atractivos, 83 hospedajes y 106 restaurantes); varios atractivos del Centro quedaron prácticamente superpuestos dentro del mapa. Los iconos existen y pueden seleccionarse; la densidad visual dificulta acertar el lugar deseado. Algunas etiquetas de distancia y marcadores tienen texto de unos 10 px.

**Acción:** añadir clustering/spiderfy o desplazamiento con agrupación, separar visualmente el pin principal de catálogo y verificar en pantalla móvil contraste/tamaño táctil (objetivo WCAG y targets ≥ 44 px cuando corresponda).

## Seguridad defensiva: controles y límites observados

- **Secretos:** no se encontraron tokens o claves de API en el código inspeccionado. `INTERNAL_API_URL`, `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_MAP_TILE_URL` son configuración de URL; el prefijo `NEXT_PUBLIC_` debe reservarse para datos que puedan ser públicos.
- **SSRF:** el cliente OSRM usa un host fijo y el handler de tarifa una ruta de archivo fija. `INTERNAL_API_URL`/`NEXT_PUBLIC_API_URL` solo afectan rewrites del servidor y no son controlables por una petición normal; deben tratarse como configuración confiable.
- **XSS/DOM:** no hay coincidencias de `dangerouslySetInnerHTML`, `document.write` o `eval`. Los tooltips de Leaflet usan nodos y `textContent`; los valores dinámicos de los iconos HTML provienen principalmente de valores numéricos/IDs internos. Mantener ese límite y no interpolar nombres de catálogo o campos de API sin escape en `L.divIcon`.
- **Catálogos cliente:** los JSON incluyen IDs, coordenadas, nombres, geometrías, fuentes y algunos campos de confianza/procedencia. Son datos operativos públicos, no credenciales; cualquier campo incluido en esos imports debe considerarse visible en el navegador.
- **API FastAPI:** filtros/fechas/enums y límites de `limit` están validados; los endpoints de lugares/scoring usan 60 solicitudes/minuto. No se observó endpoint de mutación ni payload JSON en el alcance revisado. `docs_enabled` está habilitado por defecto y conviene apagarlo en producción si no se desea publicar OpenAPI.
- **CORS:** origen predeterminado local; métodos/headers comodín y credenciales activadas. No abre el acceso a cualquier origen mientras la lista de orígenes siga restringida, pero producción debe especificar orígenes concretos y desactivar credenciales si no se necesitan.

## UX y fiabilidad

- El botón muestra «Optimizando…», pero no todas las rutas asíncronas ofrecen progreso por tramo ni una acción de cancelación.
- La geometría aproximada se representa discontinua y algunas tarjetas indican «aprox.», pero el mapa no tiene una advertencia persistente que explique que esa línea no es una ruta de calles verificada.
- La selección por teclado está prevista para pines Leaflet; la polilínea del transporte se activa mediante evento de clic y no expone por sí misma un control de teclado equivalente. Mantener también una acción accesible desde la tarjeta del tramo.
- Los viajes se guardan en `localStorage`. No se almacenan credenciales, pero el itinerario queda accesible a cualquier script del mismo origen y permanece en el dispositivo compartido hasta que se borre.

## Matriz de QA

| Caso | Resultado de esta auditoría |
|---|---|
| Build de producción y TypeScript | Pasó. |
| ESLint frontend | 0 errores; 19 advertencias existentes (hooks, `<img>` y variables/imports sin uso). |
| Pytest backend | 74 pruebas pasaron. |
| `npm audit --omit=dev` | 0 vulnerabilidades reportadas. |
| Bandit | 0 hallazgos medios/altos; 4 alertas bajas `assert_used` en módulos Python. |
| Selección de icono de mapa y adición al día | Verificado manualmente en navegador; abrió ficha y añadió la parada. |
| Filtro de categorías y marcadores | Verificado manualmente; se renderizaron iconos de atractivos, hospedajes y restaurantes. |
| Caminata interna Chan Chan → Museo de Sitio | Se mostró segmento y marcador peatonal; el tramo quedó marcado como aproximado. |
| Transporte colectivo | Se dibujaron segmento de bus y caminatas de acceso; el clic de la línea abrió la ficha y el cierre funcionó. |
| Taxi Chan Chan → Hotel El Gran Marqués | Recomendación directa, rango S/ 8–12, sin caminata a paradero; etiquetas «Punto de recojo»/«Destino» y ficha por pin/línea verificadas. |
| Integración con API local | No validable en esta sesión: el backend local no estaba disponible y las llamadas a `/api/places` devolvieron 500. |
| OSRM: accesibilidad peatonal frente a conducción | Una consulta pública de muestra devolvió para ambos perfiles la misma distancia (2,097.7 m) y 34 puntos; requiere validación operativa adicional. |
| Paradas idénticas/<50 m, >8 paradas, timeout OSRM y geometría ausente | No existen pruebas frontend automatizadas para estos casos; quedan pendientes en la matriz recomendada. |

`frontend/package.json` no define script de test y no hay archivos frontend `*.test.*`/`*.spec.*`. La dependencia de Playwright está instalada, pero no hay una suite E2E configurada. La prueba de navegador anterior fue exploratoria y no queda persistida como test.

## Plan de acción recomendado

1. **Antes de producción:** dividir/eliminar del bundle cliente el JSON urbano de 9.5 MB; medir y fijar presupuesto de chunks.
2. **Confiabilidad de rutas:** validar perfiles OSRM, propagar un estado explícito de fallback y evitar presentar geometría directa como guía de calles; definir límites de timeout/concurrencia y caché.
3. **Hardening web:** agregar CSP en modo report-only, cabeceras estándar, CORS de producción cerrado y rate limit/caché para `/api/transit/fare`.
4. **Rendimiento:** estabilizar la instancia Leaflet, agrupar consultas del endpoint `/places`, acotar paradas/pairs y aplicar cachés con tamaño y expiración reales.
5. **Reglas de transporte:** decidir 800 o 900 m y probar límites exactos en búsqueda, fallback y UI.
6. **Pruebas automatizadas:** adoptar Vitest para `routeOptimizer` y `transitService`; agregar Playwright para agregar lugares → optimizar → seleccionar tramo → abrir/cerrar ficha. Cubrir duplicados, <50 m, desconexión de red, >8 paradas, timeout >4 s, geometría ausente, cache/rate-limit y selección por teclado.
7. **UX:** clustering de pines, aviso visible de geometría aproximada, progreso/cancelación y evaluación móvil de contraste y tamaño de objetivos.

## Comandos ejecutados

- `npm --prefix frontend run lint` — completó con 0 errores y 19 advertencias.
- `npm --prefix frontend run build` — pasó; compilación de Next.js y TypeScript correctas.
- `.\.venv\Scripts\python -m pytest -q` — 74 passed.
- `npm --prefix frontend audit --omit=dev` — found 0 vulnerabilities.
- `.\.venv\Scripts\python -m bandit -q -r src` — 0 hallazgos medios/altos; terminó con cuatro alertas bajas de `assert_used`.
