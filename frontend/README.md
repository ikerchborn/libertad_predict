# Frontend

Interfaz web de Turismo La Libertad construida con Next.js App Router, React y TypeScript. El frontend consume la API local cuando está disponible y usa un snapshot incorporado para mostrar el catálogo en modo fallback.

## Desarrollo y comprobaciones

Desde este directorio:

```powershell
npm install
npm run dev
npm run lint
npm run build
```

El servidor de desarrollo se publica normalmente en `http://localhost:3000`. La URL interna de la API se configura con `INTERNAL_API_URL`; consulta `.env.local` y `next.config.ts` para el comportamiento local.

## Mapa del planificador

- `src/components/HomePlacesClient.tsx` coordina el día activo, lugares seleccionados, fichas y cálculo de segmentos.
- `src/components/PlaceMap.tsx` dibuja el mapa Leaflet, los marcadores de catálogo y de itinerario, tramos OSRM/transporte y controles de vista.
- `src/lib/transitService.ts` resuelve opciones de transporte y accesos a paraderos.
- `src/lib/osrmService.ts` obtiene geometría de caminar o conducir; la conexión directa de respaldo es aproximada.
- `src/hooks/useTripCache.ts` persiste viajes y evita duplicar una parada en el mismo día.
- `src/app/globals.css` adapta el lienzo Leaflet a sus contenedores y define los estados visuales de los marcadores.

La selección de un icono abre la ficha correspondiente. Desde una ficha de lugar se puede elegir viaje/día para incorporarlo al itinerario; los segmentos de transporte y caminata se enfocan por `legId`. El catálogo del mapa se limita a los lugares cercanos a las paradas del día, y sus categorías siguen el filtro activo del catálogo.

Para el flujo completo y las funciones concretas, consulta [ESTRUCTURA_DEL_SISTEMA.md](../ESTRUCTURA_DEL_SISTEMA.md).

## Extraer datos públicos de rutas de Trujillo

Desde este directorio, si se necesita actualizar el dataset de rutas:

```powershell
node scripts/extract_truxdi_routes.mjs
```

El extractor solicita páginas secuencialmente, espera entre solicitudes y puede continuar desde `scripts/progress.json`. Escribe datos normalizados en `src/data/rutas_trujillo.json`. La geometría ausente no se infiere ni se invierte; solo se considera verificada una traza que supera el control de georreferenciación del extractor.

El planificador contrasta accesos peatonales con OSRM cuando es posible y trata como aproximadas las geometrías no verificadas. Los datos de rutas y tarifas son informativos, no una confirmación de servicio en tiempo real. El plan municipal escaneado de agosto de 2018 es contexto histórico y no se usa para completar geometría actual.
