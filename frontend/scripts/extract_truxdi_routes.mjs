import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const outputPath = path.join(projectDirectory, 'src', 'data', 'rutas_trujillo.json');
const progressPath = path.join(scriptDirectory, 'progress.json');
const routesIndexUrl = 'https://truxdi.com/trujillo/rutas/';
const routePagePrefix = 'https://truxdi.com/trujillo/rutas/';
const requestHeaders = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
const minimumRouteDelayMs = 8_000;
const routeDelayJitterMs = 7_000;
const throttleBackoffMs = 5 * 60_000;
const maxThrottleResponses = 3;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJsonOrDefault(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function extractSsgData(html) {
  const marker = 'window.__TRUXDI_SSG_DATA__';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error('La pagina no contiene el payload publico de rutas de Truxdi.');
  }

  const jsonStart = html.indexOf('{', markerIndex + marker.length);
  if (jsonStart < 0) {
    throw new Error('No se encontro el inicio del payload publico de rutas.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = jsonStart; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(jsonStart, index + 1));
    }
  }

  throw new Error('El payload publico de rutas esta incompleto.');
}

async function fetchPage(url) {
  let throttleResponses = 0;

  while (true) {
    const response = await fetch(url, { headers: requestHeaders });
    if (response.status === 429 || response.status === 503) {
      throttleResponses += 1;
      const backoffMs = throttleBackoffMs * 2 ** (throttleResponses - 1);
      console.warn(
        `HTTP ${response.status} en ${url}. Pausa de ${Math.round(backoffMs / 60_000)} minutos.`
      );
      await sleep(backoffMs);
      if (throttleResponses >= maxThrottleResponses) {
        throw new Error(
          `El sitio sigue limitando solicitudes tras ${throttleResponses} pausas; se detiene la extraccion.`
        );
      }
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} al consultar ${url}.`);
    }
    return response.text();
  }
}

function collectRouteSlugs(routes) {
  const slugs = new Set();
  for (const route of routes) {
    if (route.slug) slugs.add(route.slug);
    for (const direction of route.directionRoutes ?? []) {
      if (direction.slug) slugs.add(direction.slug);
    }
  }
  return [...slugs];
}

function createRouteIndex(routes) {
  const index = new Map();
  for (const route of routes) {
    for (const direction of route.directionRoutes ?? []) {
      if (!direction.slug) continue;
      index.set(direction.slug, {
        ...route,
        id: direction.routeId,
        slug: direction.slug,
        code: direction.code ?? route.code,
        name: direction.name ?? route.name,
        direction: direction.direction,
      });
    }
  }
  for (const route of routes) {
    if (route.slug) index.set(route.slug, route);
  }
  return index;
}

function extractJsonLd(html) {
  const script = html.match(
    /<script\b(?=[^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/i
  );
  if (!script) throw new Error('La ficha no contiene datos estructurados de paraderos.');
  return JSON.parse(script[1]);
}

function getSvgPath(html, className) {
  const pathTags = html.match(/<path\b[^>]*>/gi) ?? [];
  const pathTag = pathTags.find((tag) =>
    new RegExp(`\\bclass=["'][^"']*\\b${className}\\b`).test(tag)
  );
  return pathTag?.match(/\bd=["']([^"']+)["']/i)?.[1] ?? '';
}

function parseSvgLine(pathData, label) {
  const tokens = pathData.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const points = [];
  let command = '';
  let cursor = 0;

  while (cursor < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[cursor])) {
      command = tokens[cursor];
      cursor += 1;
      if (command !== 'M' && command !== 'L') {
        throw new Error(`${label} usa un comando SVG no soportado: ${command}.`);
      }
    }
    if (!command || cursor + 1 >= tokens.length) {
      throw new Error(`La geometria SVG de ${label} esta incompleta.`);
    }
    const x = Number(tokens[cursor]);
    const y = Number(tokens[cursor + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`La geometria SVG de ${label} contiene coordenadas invalidas.`);
    }
    points.push([x, y]);
    cursor += 2;
    if (command === 'M') command = 'L';
  }

  return points;
}

function solveLinearSystem(matrix, values) {
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < rows.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < rows.length; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-12) {
      throw new Error('No se pudo georreferenciar el mapa SVG: puntos degenerados.');
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let index = column; index <= rows.length; index += 1) {
      rows[column][index] /= divisor;
    }
    for (let row = 0; row < rows.length; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let index = column; index <= rows.length; index += 1) {
        rows[row][index] -= factor * rows[column][index];
      }
    }
  }
  return rows.map((row) => row.at(-1));
}

function distanceMeters(first, second) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second[1] - first[1]);
  const longitudeDelta = radians(second[0] - first[0]);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first[1])) *
      Math.cos(radians(second[1])) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function georeferenceSvgRoute(html, stopItems, slug) {
  const routePath = getSvgPath(html, 'lv-track');
  const markerPath = getSvgPath(html, 'stops-o');
  if (!routePath || !markerPath) {
    return {
      coordinates: [],
      maxErrorMeters: null,
      error: 'La ficha no publico una traza SVG o sus puntos de control.',
    };
  }

  const pathPoints = parseSvgLine(routePath, slug);
  const markerPoints = [...markerPath.matchAll(/M\s*([-+\d.]+)[,\s]+([-+\d.]+)/g)].map(
    (match) => [Number(match[1]), Number(match[2])]
  );
  const geographicStops = stopItems.map((item) => [
    Number(item.item?.geo?.longitude),
    Number(item.item?.geo?.latitude),
  ]);
  if (
    markerPoints.length < 3 ||
    markerPoints.length !== geographicStops.length ||
    geographicStops.some(
      ([longitude, latitude]) =>
        !Number.isFinite(longitude) || !Number.isFinite(latitude)
    )
  ) {
    return {
      coordinates: [],
      maxErrorMeters: null,
      error: `No coinciden los puntos SVG (${markerPoints.length}) y paraderos (${geographicStops.length}).`,
    };
  }

  const designRows = markerPoints.map(([x, y]) => [x, y, 1]);
  const normalMatrix = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, column) =>
      designRows.reduce((sum, values) => sum + values[row] * values[column], 0)
    )
  );
  const fit = (coordinateIndex) => {
    const normalValues = Array.from({ length: 3 }, (_, row) =>
      designRows.reduce(
        (sum, values, index) =>
          sum + values[row] * geographicStops[index][coordinateIndex],
        0
      )
    );
    return solveLinearSystem(normalMatrix, normalValues);
  };
  const longitudeFit = fit(0);
  const latitudeFit = fit(1);
  const project = ([x, y]) => [
    x * longitudeFit[0] + y * longitudeFit[1] + longitudeFit[2],
    x * latitudeFit[0] + y * latitudeFit[1] + latitudeFit[2],
  ];
  const residuals = markerPoints.map((point, index) =>
    distanceMeters(project(point), geographicStops[index])
  );
  const maxErrorMeters = Math.max(...residuals);
  if (maxErrorMeters > 25) {
    return {
      coordinates: [],
      maxErrorMeters,
      error: `Error de ajuste SVG demasiado alto (${maxErrorMeters.toFixed(1)} m).`,
    };
  }

  return {
    coordinates: pathPoints.map(project),
    maxErrorMeters,
    error: null,
  };
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getPageMeta(html, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = (html.match(
    new RegExp(`<meta\\b(?=[^>]*\\b(?:name|property)=["']${escapedSelector}["'])[^>]*>`, 'i')
  ) ?? [])[0];
  const content = tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1];
  return content ? decodeHtmlEntities(content) : '';
}

function extractStaticRoutePage(html, slug, routeIndex) {
  const structuredData = extractJsonLd(html);
  const webPage = (structuredData['@graph'] ?? []).find(
    (entry) => entry['@type'] === 'WebPage'
  );
  const itemList = webPage?.mainEntity?.itemListElement ?? [];
  if (!Array.isArray(itemList) || itemList.length === 0) {
    throw new Error(`La ficha ${slug} no incluye paraderos georreferenciados.`);
  }

  const title = decodeHtmlEntities(
    (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? ''
  );
  const titleCode = title.match(/\(([^/()]+)\s*\/\s*([^)]+)\)/);
  const pageText = decodeHtmlEntities(
    (html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i) ?? [])[1] ?? ''
  ).replace(/<[^>]*>/g, ' ');
  const vehicleMatch = pageText.match(/\b(MICRO|COMBI)\s*[·•]\s*(?:IDA|VUELTA|CIRCULAR)\b/i);
  const fareDescription = getPageMeta(html, 'description');
  const fareMatch = fareDescription.match(/pasaje\s+S\/\.?\s*([\d]+(?:[.,][\d]+)?)/i);
  const direction =
    routeIndex?.direction ??
    (slug.endsWith('-vuelta')
      ? 'inbound'
      : slug.endsWith('-ida')
        ? 'outbound'
        : slug.endsWith('-circular')
          ? 'loop'
          : 'unknown');
  const stops = itemList.map((entry, index) => {
    const item = entry.item;
    const [name, ...landmarkParts] = String(item?.name ?? '').split(' · ');
    return {
      id: `${slug}-${index + 1}`,
      name,
      landmark_hint: landmarkParts.join(' · ') || undefined,
      latitude: item?.geo?.latitude,
      longitude: item?.geo?.longitude,
      position: index + 1,
    };
  });
  const geometry = georeferenceSvgRoute(html, itemList, slug);
  const companyName =
    webPage?.about?.name ??
    routeIndex?.operators?.find((operator) => operator.isPrimary)?.name ??
    routeIndex?.company?.name ??
    null;
  const badgeColor = html.match(/--lv\s*:\s*(#[\da-f]{6})/i)?.[1] ?? null;
  const textColor = html.match(/--on-lv\s*:\s*(#[\da-f]{6})/i)?.[1] ?? null;

  return {
    ...routeIndex,
    id: routeIndex?.id ?? slug,
    slug,
    code: routeIndex?.code ?? titleCode?.[2]?.trim() ?? titleCode?.[1]?.trim() ?? null,
    routeCode: routeIndex?.variantLabel ?? titleCode?.[1]?.trim() ?? null,
    publicDisplayName:
      routeIndex?.publicDisplayName ??
      webPage?.mainEntity?.name?.replace(/^Paraderos de /i, '').replace(/\s+\((ida|vuelta)\)$/i, '') ??
      null,
    direction,
    baseFare: routeIndex?.baseFare ?? (fareMatch ? Number(fareMatch[1].replace(',', '.')) : null),
    estimatedMinutes: routeIndex?.estimatedMinutes ?? null,
    vehicleType:
      normalizeVehicleType(routeIndex?.vehicleType) ??
      vehicleMatch?.[1]?.toLowerCase() ??
      'unknown',
    badgeColor,
    textColor,
    badgeColorSource: badgeColor ? 'Truxdi route-page palette' : null,
    company: { name: companyName },
    operators: routeIndex?.operators ?? [{ name: companyName, isPrimary: true }],
    stops,
    pathGeometry: { type: 'LineString', coordinates: geometry.coordinates },
    geometrySource: 'Truxdi public route-map SVG georeferenced to published stop coordinates',
    geometryFitErrorMeters: geometry.maxErrorMeters,
    geometryError: geometry.error,
  };
}

function extractRoutePage(html, slug, routeIndex) {
  if (html.includes('window.__TRUXDI_SSG_DATA__')) {
    const data = extractSsgData(html);
    if (!data.route) throw new Error(`La ficha ${slug} no contiene un objeto de ruta.`);
    return data.route;
  }
  return extractStaticRoutePage(html, slug, routeIndex);
}

function getRouteGroupId(route) {
  if (route.direction === 'loop') return route.id;

  const directions = route.directionRoutes ?? [];
  const outbound = directions.find((direction) => direction.direction === 'outbound');
  const inbound = directions.find((direction) => direction.direction === 'inbound');
  if (outbound && inbound) return outbound.routeId;
  if (outbound) return outbound.routeId;
  if (inbound) return inbound.routeId;
  return route.canonicalRouteId ?? route.id;
}

function enrichGroupedRoutes(routesById, indexedRoutes) {
  const metadataByGroupId = new Map();
  for (const route of indexedRoutes) {
    metadataByGroupId.set(String(route.id), route);
    for (const direction of route.directionRoutes ?? []) {
      if (!direction.slug) continue;
      const directionRoute = {
        ...route,
        ...direction,
        id: direction.routeId,
        direction: direction.direction,
        directionRoutes: route.directionRoutes,
      };
      const groupId = String(getRouteGroupId(directionRoute));
      if (!metadataByGroupId.has(groupId)) {
        metadataByGroupId.set(groupId, directionRoute);
      }
    }
  }

  for (const [groupId, route] of routesById) {
    const metadata = metadataByGroupId.get(groupId);
    if (!metadata) continue;
    route.company_name ??=
      metadata.operators?.find((operator) => operator.isPrimary)?.name ??
      metadata.company?.name ??
      null;
    route.route_name ??=
      metadata.publicDisplayName ?? metadata.serviceName ?? metadata.name ?? null;
    route.route_code ??=
      metadata.variantLabel ?? metadata.serviceCodeLabel ?? metadata.code ?? null;
    route.source_route_code ??= metadata.code ?? null;
    route.vehicle_type ??= normalizeVehicleType(metadata.vehicleType);
    route.estimated_minutes ??= Number.isFinite(Number(metadata.estimatedMinutes))
      ? Number(metadata.estimatedMinutes)
      : null;
    if (!Number.isFinite(route.fare?.standard) && Number.isFinite(metadata.baseFare)) {
      route.fare = { standard: metadata.baseFare, currency: 'PEN' };
    }
  }
}

function parseCoordinates(coordinates, label) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error(`Coordenadas invalidas en ${label}.`);
  }
  const [longitude, latitude] = coordinates.map(Number);
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new Error(`Coordenadas fuera de rango en ${label}.`);
  }
  return [longitude, latitude];
}

function normalizeVehicleType(vehicleType) {
  if (vehicleType === 'micro' || vehicleType === 'combi') return vehicleType;
  return null;
}

function getDirection(route) {
  if (route.direction === 'outbound' || route.direction === 'loop') return 'ida';
  if (route.direction === 'inbound') return 'vuelta';
  return null;
}

function mergeRoutePage(routesById, route, pageUrl) {
  const groupId = String(getRouteGroupId(route));
  const direction = getDirection(route);
  const existing = routesById.get(groupId) ?? {
    route_id: groupId,
    company_name:
      route.operators?.find((operator) => operator.isPrimary)?.name ??
      route.company?.name ??
      null,
    route_name: route.publicDisplayName ?? route.serviceName ?? route.name ?? null,
    route_code:
      route.routeCode ?? route.variantLabel ?? route.serviceCodeLabel ?? route.code ?? null,
    source_route_code: route.code ?? null,
    vehicle_type: normalizeVehicleType(route.vehicleType),
    estimated_minutes: Number.isFinite(Number(route.estimatedMinutes))
      ? Number(route.estimatedMinutes)
      : null,
    badge_color: route.badgeColor ?? null,
    text_color: route.textColor ?? null,
    badge_color_source: route.badgeColorSource ?? null,
    fare: {
      standard: Number(route.baseFare),
      currency: 'PEN',
    },
    geometry_ida: [],
    geometry_vuelta: [],
    geometry_ida_verified: false,
    geometry_vuelta_verified: false,
    stops: [],
    source: 'Truxdi public route page',
    source_url: pageUrl,
    direction_sources: [],
  };
  const geometry = route.pathGeometry?.coordinates;
  const normalizedGeometry = Array.isArray(geometry)
    ? geometry.map((coordinates, index) =>
        parseCoordinates(coordinates, `${route.slug} geometry point ${index + 1}`)
      )
    : [];
  const routeReview = (route.directionRoutes ?? []).find(
    (directionRoute) => directionRoute.routeId === route.id
  );
  const geometryVerified =
    routeReview?.reviewStatus === 'auto_approved' &&
    (routeReview.confidence ?? 0) >= 0.7 &&
    normalizedGeometry.length > 1 &&
    (route.geometryFitErrorMeters === undefined ||
      route.geometryFitErrorMeters <= 10);

  if (direction === 'ida') {
    existing.geometry_ida = normalizedGeometry;
    existing.geometry_ida_verified = geometryVerified;
  } else if (direction === 'vuelta') {
    existing.geometry_vuelta = normalizedGeometry;
    existing.geometry_vuelta_verified = geometryVerified;
  }
  else if (normalizedGeometry.length) {
    existing.geometry_unclassified = normalizedGeometry;
  }

  for (const stop of route.stops ?? []) {
    const longitude = Number(stop.longitude);
    const latitude = Number(stop.latitude);
    const coordinates = parseCoordinates([longitude, latitude], `${route.slug} stop ${stop.id}`);
    const normalizedStop = {
      name: stop.name,
      coordinates,
      direction,
      source_direction: route.direction ?? 'unknown',
      source_stop_id: String(stop.id),
      position: Number(stop.position),
      ...(stop.landmark_hint ? { landmark_hint: stop.landmark_hint } : {}),
    };
    const stopKey = `${normalizedStop.source_direction}:${normalizedStop.source_stop_id}`;
    if (
      direction !== null &&
      !existing.stops.some(
        (savedStop) =>
          `${savedStop.source_direction}:${savedStop.source_stop_id}` === stopKey
      )
    ) {
      existing.stops.push(normalizedStop);
    } else if (direction === null) {
      existing.stops_unclassified ??= [];
      if (
        !existing.stops_unclassified.some(
          (savedStop) =>
            `${savedStop.source_direction}:${savedStop.source_stop_id}` === stopKey
        )
      ) {
        existing.stops_unclassified.push(normalizedStop);
      }
    }
  }

  existing.direction_sources = existing.direction_sources.filter(
    (source) => source.route_id !== String(route.id)
  );
  existing.direction_sources.push({
    route_id: String(route.id),
    slug: route.slug,
    direction: route.direction ?? 'unknown',
    review_status: routeReview?.reviewStatus ?? 'unknown',
    confidence: routeReview?.confidence ?? null,
    geometry_points: normalizedGeometry.length,
    geometry_source: route.geometrySource ?? 'Truxdi embedded GeoJSON',
    geometry_fit_error_meters: route.geometryFitErrorMeters ?? null,
    geometry_error: route.geometryError ?? null,
    source_url: pageUrl,
  });
  existing.stops.sort(
    (left, right) =>
      left.direction.localeCompare(right.direction) || left.position - right.position
  );
  routesById.set(groupId, existing);
}

function addStopGeometryPositions(route) {
  const previousPositionByDirection = new Map();
  for (const stop of route.stops) {
    const geometry =
      stop.direction === 'ida' ? route.geometry_ida : route.geometry_vuelta;
    delete stop.geometry_position;
    delete stop.geometry_distance_m;
    if (!Array.isArray(geometry) || geometry.length < 2) continue;

    const latitudeRadians = (stop.coordinates[1] * Math.PI) / 180;
    const longitudeScale = 111_320 * Math.cos(latitudeRadians);
    const stopPoint = [
      stop.coordinates[0] * longitudeScale,
      stop.coordinates[1] * 111_320,
    ];
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestPosition = null;
    const minimumPosition = previousPositionByDirection.get(stop.direction) ?? 0;

    for (let index = 0; index < geometry.length - 1; index += 1) {
      const start = [
        geometry[index][0] * longitudeScale,
        geometry[index][1] * 111_320,
      ];
      const end = [
        geometry[index + 1][0] * longitudeScale,
        geometry[index + 1][1] * 111_320,
      ];
      const delta = [end[0] - start[0], end[1] - start[1]];
      const lengthSquared = delta[0] ** 2 + delta[1] ** 2;
      const fraction =
        lengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((stopPoint[0] - start[0]) * delta[0] +
                  (stopPoint[1] - start[1]) * delta[1]) /
                  lengthSquared
              )
            );
      const position = index + fraction;
      if (position + 1e-6 < minimumPosition) continue;
      const distance = Math.hypot(
        stopPoint[0] - (start[0] + fraction * delta[0]),
        stopPoint[1] - (start[1] + fraction * delta[1])
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPosition = position;
      }
    }

    stop.geometry_distance_m = Number(bestDistance.toFixed(1));
    if (bestDistance <= 50 && bestPosition !== null) {
      stop.geometry_position = bestPosition;
      previousPositionByDirection.set(stop.direction, bestPosition);
    }
  }
}

function createOutput(routesById, pagesProcessed, routeCount) {
  const routes = [...routesById.values()];
  routes.forEach(addStopGeometryPositions);
  return {
    metadata: {
      source: 'Truxdi public routes catalog',
      source_url: routesIndexUrl,
      extraction_method:
        'Public HTML SSG payloads or JSON-LD stop data plus route-map SVG georeferencing',
      separate_route_json_endpoint_observed: false,
      listed_route_count: routeCount,
      fetched_route_pages: pagesProcessed,
      generated_at: new Date().toISOString(),
      geometry_note:
        'Published GeoJSON is preserved in [longitude, latitude] order. Legacy SVG route traces are georeferenced against their published stop coordinates and kept only when maximum fit error is at most 25 m. Missing directions are not inferred or reversed.',
      historical_pdf_note:
        'The scanned August 2018 municipal plan lists 37 proposed routes but no current GPS geometry; it is historical context only and does not fill missing route traces.',
    },
    routes: routes.sort((left, right) =>
      left.route_id.localeCompare(right.route_id, undefined, { numeric: true })
    ),
  };
}

async function main() {
  const indexHtml = await fetchPage(routesIndexUrl);
  const indexData = extractSsgData(indexHtml);
  if (!Array.isArray(indexData.routes)) {
    throw new Error('El catalogo publico no contiene una lista de rutas reconocible.');
  }

  const routeSlugs = collectRouteSlugs(indexData.routes);
  const routeIndex = createRouteIndex(indexData.routes);
  if (process.argv.includes('--discover-only')) {
    console.log(
      JSON.stringify(
        {
          listedRoutes: indexData.routes.length,
          discoveredRoutePages: routeSlugs.length,
          routeDataInListPayload: false,
        },
        null,
        2
      )
    );
    return;
  }

  const progress = await readJsonOrDefault(progressPath, {
    processedSlugs: [],
    discoveredSlugs: [],
  });
  const savedOutput = await readJsonOrDefault(outputPath, { routes: [] });
  const routesById = new Map(
    (savedOutput.routes ?? []).map((route) => {
      const directionSources = (route.direction_sources ?? []).map((source) => ({
        geometry_source: 'Truxdi embedded GeoJSON',
        geometry_fit_error_meters: null,
        geometry_error: null,
        ...source,
      }));
      const verified = (direction) =>
        directionSources.some(
          (source) =>
            source.direction === direction &&
            source.review_status === 'auto_approved' &&
            (source.confidence ?? 0) >= 0.7 &&
            source.geometry_points > 1
        );
      return [
        String(route.route_id),
        {
          ...route,
          source_route_code: route.source_route_code ?? route.route_code ?? null,
          route_name: route.route_name ?? null,
          badge_color: route.badge_color ?? null,
          text_color: route.text_color ?? null,
          badge_color_source: route.badge_color_source ?? null,
          estimated_minutes: route.estimated_minutes ?? null,
          geometry_ida: route.geometry_ida ?? [],
          geometry_vuelta: route.geometry_vuelta ?? [],
          geometry_ida_verified:
            route.geometry_ida_verified ??
            (verified('outbound') || verified('loop')),
          geometry_vuelta_verified:
            route.geometry_vuelta_verified ?? verified('inbound'),
          direction_sources: directionSources,
          stops: route.stops ?? [],
        },
      ];
    })
  );
  enrichGroupedRoutes(routesById, indexData.routes);
  const processedSlugs = new Set(progress.processedSlugs ?? []);
  const queue = [...new Set([...(progress.discoveredSlugs ?? []), ...routeSlugs])];

  progress.discoveredSlugs = queue;
  progress.updatedAt = new Date().toISOString();
  await writeJson(progressPath, progress);

  let newlyProcessed = 0;
  for (const slug of queue) {
    if (processedSlugs.has(slug)) continue;
    await sleep(
      minimumRouteDelayMs + Math.floor(Math.random() * routeDelayJitterMs)
    );

    const pageUrl = new URL(`${slug}/`, routePagePrefix).toString();
    const html = await fetchPage(pageUrl);
    const route = extractRoutePage(html, slug, routeIndex.get(slug));
    mergeRoutePage(routesById, route, pageUrl);
    for (const direction of route.directionRoutes ?? []) {
      if (direction.slug && !queue.includes(direction.slug)) {
        queue.push(direction.slug);
      }
    }

    processedSlugs.add(slug);
    progress.processedSlugs = [...processedSlugs];
    progress.discoveredSlugs = queue;
    progress.updatedAt = new Date().toISOString();
    await writeJson(
      outputPath,
      createOutput(routesById, processedSlugs.size, indexData.routes.length)
    );
    await writeJson(progressPath, progress);

    newlyProcessed += 1;
    console.log(
      `Procesada ${processedSlugs.size}/${queue.length}: ${slug} (${route.direction ?? 'unknown'}, ${route.pathGeometry?.coordinates?.length ?? 0} puntos)`
    );
    if (route.geometryError) {
      console.warn(`Traza omitida para ${slug}: ${route.geometryError}`);
    }
    const maxPagesArgument = process.argv.find((argument) =>
      argument.startsWith('--max-pages=')
    );
    if (
      maxPagesArgument &&
      newlyProcessed >= Number(maxPagesArgument.split('=')[1])
    ) {
      break;
    }
  }

  progress.processedSlugs = [...processedSlugs];
  progress.discoveredSlugs = queue;
  progress.updatedAt = new Date().toISOString();
  await writeJson(
    outputPath,
    createOutput(routesById, processedSlugs.size, indexData.routes.length)
  );
  await writeJson(progressPath, progress);
  console.log(
    `Extraccion guardada: ${routesById.size} rutas agrupadas, ${processedSlugs.size} fichas procesadas.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
