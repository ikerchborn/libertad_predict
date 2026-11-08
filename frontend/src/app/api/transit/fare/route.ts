import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

interface TransitCatalog {
  routes?: Array<{ baseFare?: unknown }>;
}

export async function GET() {
  const catalogPath = path.resolve(
    process.cwd(),
    '..',
    'prueva_maps',
    'Trujillo-OMUS',
    'data.json'
  );

  try {
    const raw = await fs.readFile(catalogPath, 'utf8');
    const catalog = JSON.parse(raw.replace(/^\uFEFF/, '')) as TransitCatalog;
    const fares = (catalog.routes ?? [])
      .map((route) => route.baseFare)
      .filter((fare): fare is number => typeof fare === 'number' && Number.isFinite(fare));

    if (fares.length === 0 || fares.some((fare) => fare <= 0)) {
      return NextResponse.json(
        { error: 'El catálogo GTFS no contiene tarifas urbanas válidas.' },
        { status: 500 }
      );
    }

    const urbanBaseFare = fares[0];
    if (fares.some((fare) => fare !== urbanBaseFare)) {
      return NextResponse.json(
        { error: 'El catálogo GTFS contiene tarifas urbanas inconsistentes.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      urbanBaseFare,
      source: 'prueva_maps/Trujillo-OMUS/data.json',
      routeCount: fares.length,
    });
  } catch (error) {
    console.error('No se pudo leer el catálogo tarifario GTFS:', error);
    return NextResponse.json(
      { error: 'No se pudo leer el catálogo tarifario GTFS.' },
      { status: 500 }
    );
  }
}
