import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

interface TransitCatalog {
  routes?: Array<{ baseFare?: unknown }>;
}

interface TransitFareResponse {
  urbanBaseFare: number;
  source: string;
  routeCount: number;
}

const FARE_CACHE_TTL_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_REQUESTS = 60;
const MAX_RATE_LIMIT_CLIENTS = 1024;
let cachedFare: { expiresAt: number; value: TransitFareResponse } | null = null;
let fareLoad: Promise<TransitFareResponse> | null = null;
const requestsByClient = new Map<string, { startedAt: number; count: number }>();

async function loadTransitFare(): Promise<TransitFareResponse> {
  const catalogPath = path.resolve(
    process.cwd(),
    '..',
    'prueva_maps',
    'Trujillo-OMUS',
    'data.json'
  );

  const raw = await fs.readFile(catalogPath, 'utf8');
  const catalog = JSON.parse(raw.replace(/^\uFEFF/, '')) as TransitCatalog;
  const fares = (catalog.routes ?? [])
    .map((route) => route.baseFare)
    .filter((fare): fare is number => typeof fare === 'number' && Number.isFinite(fare));

  if (fares.length === 0 || fares.some((fare) => fare <= 0)) {
    throw new Error('El catálogo GTFS no contiene tarifas urbanas válidas.');
  }
  const urbanBaseFare = fares[0];
  if (fares.some((fare) => fare !== urbanBaseFare)) {
    throw new Error('El catálogo GTFS contiene tarifas urbanas inconsistentes.');
  }
  return {
    urbanBaseFare,
    source: 'prueva_maps/Trujillo-OMUS/data.json',
    routeCount: fares.length,
  };
}

function isWithinRateLimit(request: Request): boolean {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientIp = request.headers.get('x-real-ip')?.trim() || forwardedFor;
  if (!clientIp) return true;

  const now = Date.now();
  for (const [key, entry] of requestsByClient) {
    if (now - entry.startedAt >= RATE_LIMIT_WINDOW_MS * 2) {
      requestsByClient.delete(key);
    }
  }

  const current = requestsByClient.get(clientIp);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestsByClient.set(clientIp, { startedAt: now, count: 1 });
  } else if (current.count >= RATE_LIMIT_REQUESTS) {
    return false;
  } else {
    current.count += 1;
  }

  while (requestsByClient.size > MAX_RATE_LIMIT_CLIENTS) {
    const oldestClient = requestsByClient.keys().next().value;
    if (oldestClient === undefined) break;
    requestsByClient.delete(oldestClient);
  }
  return true;
}

export async function GET(request: Request) {
  if (!isWithinRateLimit(request)) {
    return NextResponse.json(
      { error: 'Se excedió el límite de consultas de tarifa. Intenta nuevamente en un minuto.' },
      { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } }
    );
  }

  const now = Date.now();
  if (cachedFare && now < cachedFare.expiresAt) {
    return NextResponse.json(cachedFare.value, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    });
  }

  try {
    fareLoad ??= loadTransitFare();
    const fare = await fareLoad;
    cachedFare = { value: fare, expiresAt: Date.now() + FARE_CACHE_TTL_MS };
    return NextResponse.json(fare, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('No se pudo leer el catálogo tarifario GTFS:', error);
    return NextResponse.json(
      { error: 'No se pudo leer el catálogo tarifario GTFS.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  } finally {
    fareLoad = null;
  }
}
