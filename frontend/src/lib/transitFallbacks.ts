/** Provides regional transit fallbacks, internal walking, taxi estimates, and access validation. */
import type { Place } from '@/lib/types';
import { haversineKm } from '@/lib/routeOptimizer';
import type { OsrmRouteResult } from '@/lib/osrmService';
import type { TransitOption } from '@/lib/transitTypes';
import { getZone, getCatalogRoute } from '@/lib/transitCatalog';
import { getRouteColor, TRANSIT_STOPS, CHICAMA_FARE, EL_BRUJO_FARE, HUAMACHUCO_FARE } from '@/lib/transitCatalogData';
import { isTransitWalkOverLimitKm, MAX_TRANSIT_WALK_KM } from '@/lib/transitPolicy';
import { getWalkingRoute } from '@/lib/transitGeometry';
import { enrichTransitOption } from '@/lib/transitOptionMetadata';

/**
 * Estimates a local taxi fare and travel time from the supplied road-distance estimate.
 *
 * @returns A low/high fare range, midpoint, and estimated in-vehicle minutes.
 */
export function calculateTaxiEstimate(distKm: number): {
  fareMin: number;
  fareMax: number;
  fareAvg: number;
  estimatedMinutes: number;
} {
  let fareMin: number;
  let fareMax: number;
  if (distKm <= 2.5) {
    fareMin = 6.0;
    fareMax = 8.0;
  } else if (distKm <= 5.0) {
    fareMin = 8.0;
    fareMax = 12.0;
  } else if (distKm <= 9.0) {
    fareMin = Math.round(12.0 + (distKm - 5.0) * 1.8);
    fareMax = Math.round(16.0 + (distKm - 5.0) * 2.2);
  } else if (distKm <= 16.0) {
    fareMin = Math.round(19.0 + (distKm - 9.0) * 1.6);
    fareMax = Math.round(26.0 + (distKm - 9.0) * 2.0);
  } else {
    fareMin = Math.round(32.0 + (distKm - 16.0) * 1.5);
    fareMax = Math.round(42.0 + (distKm - 16.0) * 1.9);
  }
  const fareAvg = Math.round(((fareMin + fareMax) / 2) * 10) / 10;
  const estimatedMinutes = Math.max(5, Math.round((distKm / 28) * 60));
  return { fareMin, fareMax, fareAvg, estimatedMinutes };
}

/** Identifies place pairs that can be served by the internal Chan Chan walking route. */
export function isInternalIntraZoneWalk(
  origin: Place,
  destination: Place,
  distanceKm = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon)
): boolean {
  const isKnownChanChanPair =
    (origin.id === 3 && destination.id === 415) ||
    (origin.id === 415 && destination.id === 3);
  return getZone(origin) === 'chan_chan' &&
    getZone(destination) === 'chan_chan' &&
    (distanceKm <= 1.2 || (isKnownChanChanPair && distanceKm <= 3));
}

/** Builds the internal walking option, using OSRM geometry only when it passes plausibility checks. */
export function createInternalWalkOption(
  origin: Place,
  destination: Place,
  walkingRoute?: OsrmRouteResult | null
): TransitOption {
  const directDistanceKm = haversineKm(
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon
  );
  const validWalkingRoute =
    walkingRoute &&
      !walkingRoute.isFallback &&
      walkingRoute.distanceKm <= 1.2 &&
      walkingRoute.distanceKm <= Math.max(directDistanceKm * 2.5, directDistanceKm + 0.2)
      ? walkingRoute
      : null;
  const routeDistanceKm = validWalkingRoute
    ? validWalkingRoute.distanceKm
    : directDistanceKm;
  const durationMinutes = validWalkingRoute && validWalkingRoute.durationMin > 0
    ? validWalkingRoute.durationMin
    : Math.max(1, Math.round((routeDistanceKm / 4.5) * 60));
  return {
    code: 'WALK-INTERNAL',
    serviceName: 'Sendero peatonal interno',
    vehicleType: 'caminata',
    farePen: 0,
    estimatedMinutes: durationMinutes,
    waitMinutes: 0,
    boardingStop: origin.name,
    dropoffStop: destination.name,
    boardingPoint: [origin.lat, origin.lon],
    dropoffPoint: [destination.lat, destination.lon],
    instructions: `Caminar ~${durationMinutes} min por el sendero interior del complejo hasta ${destination.name}.`,
    routeGeometry: validWalkingRoute
      ? validWalkingRoute.coordinates
      : [[origin.lat, origin.lon], [destination.lat, destination.lon]],
    routeGeometryVerified: Boolean(validWalkingRoute),
    routeDistanceKm,
    confidence: 'media',
    source: 'Caminata interna en Chan Chan',
  };
}

/** Resolves a synchronous catalog-based suggestion before network-validated access checks. */
export function getTransitBetweenPlacesBase(
  origin: Place,
  destination: Place,
  urbanFare = 2.5
): TransitOption {
  const dist = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon);
  const fromZone = getZone(origin);
  const toZone = getZone(destination);

  if (isInternalIntraZoneWalk(origin, destination, dist)) {
    return createInternalWalkOption(origin, destination);
  }

  if (dist <= 0.3) {
    return {
      code: 'WALK',
      serviceName: 'Caminata Peatonal',
      vehicleType: 'caminata',
      farePen: 0,
      estimatedMinutes: Math.max(5, Math.round((dist / 4.5) * 60)),
      waitMinutes: 0,
      boardingStop: origin.name,
      dropoffStop: destination.name,
      boardingPoint: [origin.lat, origin.lon],
      dropoffPoint: [destination.lat, destination.lon],
      instructions: `Trayecto corto de ${Math.round(dist * 1000)} m en línea directa. La distancia real a pie puede ser mayor; sigue las calles peatonales.`,
    };
  }

  const catalogOption = getCatalogRoute(fromZone, toZone);
  if (catalogOption) return catalogOption;

  // Chan Chan <-> Museo de Sitio Chan Chan (dentro del mismo complejo arqueológico)
  if (
    (origin.id === 3 && destination.id === 415) ||
    (origin.id === 415 && destination.id === 3) ||
    (fromZone === 'chan_chan' && toZone === 'chan_chan' && dist < 3.0)
  ) {
    return {
      code: 'TAXI-LOCAL',
      routeColor: getRouteColor('TAXI-LOCAL'),
      serviceName: 'Taxi local / Mototaxi o Caminata',
      vehicleType: 'taxi',
      farePen: 5.0,
      fareRangePen: [4.0, 7.0],
      estimatedMinutes: 5,
      waitMinutes: 0,
      boardingStop: `Frontis de ${origin.name}`,
      dropoffStop: `Puerta de ingreso a ${destination.name}`,
      boardingPoint: [origin.lat, origin.lon],
      dropoffPoint: [destination.lat, destination.lon],
      instructions: `Recorrido de ${dist.toFixed(1)} km dentro del complejo arqueológico. Puedes caminar (~15 min) o tomar taxi/mototaxi local por S/ 4.00 – 7.00 (~5 min).`,
      confidence: 'alta',
      source: 'Circuito arqueológico Chan Chan',
    };
  }

  // Trujillo Centro <-> Huanchaco
  if ((fromZone === 'centro' && toZone === 'huanchaco') || (fromZone === 'huanchaco' && toZone === 'centro')) {
    return {
      code: 'M-06 B',
      routeColor: getRouteColor('M-06 B'),
      serviceName: 'Microbús Línea B ("La B de Huanchaco")',
      headsign: 'Huanchaco',
      vehicleType: 'micro',
      farePen: urbanFare,
      estimatedMinutes: 30,
      waitMinutes: 6,
      boardingStop: fromZone === 'centro' ? 'Av. Mansiche / Óvalo Mansiche' : 'Av. Víctor Larco / Malecón Huanchaco',
      dropoffStop: toZone === 'huanchaco' ? 'Playa Huanchaco / Malecón' : 'Av. España / Centro Histórico',
      boardingPoint: fromZone === 'centro' ? TRANSIT_STOPS.mansiche : TRANSIT_STOPS.huanchaco,
      dropoffPoint: toZone === 'huanchaco' ? TRANSIT_STOPS.huanchaco : TRANSIT_STOPS.mansiche,
      instructions: 'Abordar el tradicional micro amarillo "Línea B" en Av. Mansiche. Frecuencia continua cada 6 minutos.',
    };
  }

  // Trujillo Centro <-> Chan Chan
  if ((fromZone === 'centro' && toZone === 'chan_chan') || (fromZone === 'chan_chan' && toZone === 'centro')) {
    return {
      code: 'M-04 A',
      routeColor: getRouteColor('M-04 A'),
      serviceName: 'Micro Huanchaco (Línea A)',
      headsign: 'Huanchaco',
      vehicleType: 'micro',
      farePen: urbanFare,
      estimatedMinutes: 20,
      waitMinutes: 6,
      boardingStop: fromZone === 'centro' ? 'Av. Mansiche / Óvalo Papal' : 'Carretera a Huanchaco (Frontis Chan Chan)',
      dropoffStop: toZone === 'chan_chan' ? 'Ingreso a Chan Chan (Museo de Sitio)' : 'Av. Mansiche / Centro',
      boardingPoint: fromZone === 'centro' ? TRANSIT_STOPS.mansiche : TRANSIT_STOPS.museoChanChan,
      dropoffPoint: toZone === 'chan_chan' ? TRANSIT_STOPS.museoChanChan : TRANSIT_STOPS.mansiche,
      instructions: 'Tomar micro con dirección a Huanchaco y solicitar bajar en el paradero del Templo Nik An / Museo de Sitio.',
    };
  }

  // Chan Chan <-> Huanchaco
  if ((fromZone === 'chan_chan' && toZone === 'huanchaco') || (fromZone === 'huanchaco' && toZone === 'chan_chan')) {
    return {
      code: 'C-27 B',
      routeColor: getRouteColor('C-27 B'),
      serviceName: 'Combi Línea B ("Caballito de Totora")',
      vehicleType: 'combi',
      farePen: urbanFare,
      estimatedMinutes: 12,
      waitMinutes: 6,
      boardingStop: 'Carretera Huanchaco',
      dropoffStop: 'Balneario de Huanchaco',
      boardingPoint: fromZone === 'chan_chan' ? TRANSIT_STOPS.chanChan : TRANSIT_STOPS.huanchaco,
      dropoffPoint: fromZone === 'chan_chan' ? TRANSIT_STOPS.huanchaco : TRANSIT_STOPS.chanChan,
      instructions: 'Trayecto corto directo por la carretera asfaltada hacia el balneario.',
    };
  }

  // Trujillo Centro <-> Huacas del Sol y de la Luna (Moche)
  if ((fromZone === 'centro' && toZone === 'moche') || (fromZone === 'moche' && toZone === 'centro')) {
    return {
      code: 'C-14 S',
      routeColor: getRouteColor('C-14 S'),
      serviceName: 'Combi Línea S ("La S de Sol y Luna")',
      vehicleType: 'combi',
      farePen: urbanFare,
      estimatedMinutes: 25,
      waitMinutes: 6,
      boardingStop: fromZone === 'centro' ? 'Óvalo Grau / Av. América Sur' : 'Frontis Huacas de Moche',
      dropoffStop: toZone === 'moche' ? 'Museo Huacas de Moche / Huaca de la Luna' : 'Óvalo Grau / Centro',
      boardingPoint: fromZone === 'centro' ? TRANSIT_STOPS.grau : TRANSIT_STOPS.moche,
      dropoffPoint: toZone === 'moche' ? TRANSIT_STOPS.moche : TRANSIT_STOPS.grau,
      instructions: 'Abordar la combi blanca y celeste con letrero "Campiña de Moche - Huacas". Te deja en la puerta del santuario.',
    };
  }

  // Trujillo <-> Puerto Chicama (Malabrigo)
  if (fromZone === 'chicama' || toZone === 'chicama') {
    return {
      code: 'INTER-CHICAMA',
      routeColor: getRouteColor('INTER-CHICAMA'),
      serviceName: 'Ómnibus Interprovincial Chicama Express',
      vehicleType: 'bus',
      farePen: CHICAMA_FARE,
      estimatedMinutes: 80,
      waitMinutes: 15,
      boardingStop: 'Terminal Santa Cruz / Óvalo El Chira (Trujillo)',
      dropoffStop: 'Plaza de Armas de Puerto Malabrigo',
      boardingPoint: fromZone === 'chicama' ? TRANSIT_STOPS.chicama : TRANSIT_STOPS.santaCruz,
      dropoffPoint: fromZone === 'chicama' ? TRANSIT_STOPS.santaCruz : TRANSIT_STOPS.chicama,
      instructions: 'Salidas cada 30 minutos por la Panamericana Norte hacia la caleta y la ola izquierda.',
    };
  }

    // Trujillo <-> El Brujo (Magdalena de Cao)
  if (fromZone === 'el_brujo' || toZone === 'el_brujo') {
    return {
      code: 'RUTA-CAO',
      routeColor: getRouteColor('RUTA-CAO'),
      serviceName: 'Transporte Interprovincial Chocope - Magdalena de Cao',
      vehicleType: 'bus',
      farePen: EL_BRUJO_FARE,
      estimatedMinutes: 65,
      waitMinutes: 15,
      boardingStop: 'Terminal Santa Cruz (Trujillo) o Paradero Chocope',
      dropoffStop: 'Complejo Arqueológico El Brujo / Museo Cao',
      boardingPoint: fromZone === 'el_brujo' ? TRANSIT_STOPS.brujo : TRANSIT_STOPS.santaCruz,
      dropoffPoint: fromZone === 'el_brujo' ? TRANSIT_STOPS.santaCruz : TRANSIT_STOPS.brujo,
      instructions: 'Ruta por la Panamericana Norte hacia Chocope y conexión directa a Magdalena de Cao (aprox. 1h 10min).',
    };
  }

  // Trujillo <-> Marcahuamachuco (Huamachuco)
  if (fromZone === 'huamachuco' || toZone === 'huamachuco') {
    return {
      code: 'ANDINO-HUAMACHUCO',
      routeColor: getRouteColor('ANDINO-HUAMACHUCO'),
      serviceName: 'Bus Interandino Negreiros / Los Andes',
      vehicleType: 'bus',
      farePen: HUAMACHUCO_FARE,
      estimatedMinutes: 240,
      waitMinutes: 15,
      boardingStop: 'Terminal Terrestre El Chira / Prol. Vallejo',
      dropoffStop: 'Terminal Terrestre de Huamachuco (3,200 msnm)',
      boardingPoint: fromZone === 'huamachuco' ? TRANSIT_STOPS.huamachuco : TRANSIT_STOPS.santaCruz,
      dropoffPoint: fromZone === 'huamachuco' ? TRANSIT_STOPS.santaCruz : TRANSIT_STOPS.huamachuco,
      instructions: 'Viaje de montaña por la sierra de La Libertad. Recomendado salir a primera hora (05:00 - 06:00 AM).',
    };
  }

  // Sin línea directa de transporte público verificada: se recomienda Taxi / Aplicativo con tarifa calculada
  const taxi = calculateTaxiEstimate(dist);
  return {
    code: 'TAXI',
    routeColor: getRouteColor('TAXI'),
    serviceName: 'Taxi directo / Aplicativo (Yango, Uber, inDrive)',
    headsign: destination.name,
    vehicleType: 'taxi',
    farePen: taxi.fareAvg,
    fareRangePen: [taxi.fareMin, taxi.fareMax],
    estimatedMinutes: taxi.estimatedMinutes,
    waitMinutes: 0,
    boardingStop: `Punto de partida (${origin.name})`,
    dropoffStop: `Destino directo (${destination.name})`,
    boardingPoint: [origin.lat, origin.lon],
    dropoffPoint: [destination.lat, destination.lon],
    instructions: `Sin combi o micro directo para este trayecto. Te recomendamos tomar Taxi o aplicativo (Yango, Uber, inDrive). Tarifa estimada en Trujillo: S/ ${taxi.fareMin.toFixed(2)} – S/ ${taxi.fareMax.toFixed(2)} (~${taxi.estimatedMinutes} min).`,
    confidence: 'media',
    source: 'Tarifario referencial de taxis en Trujillo',
  };
}

/**
 * Returns a synchronous transit suggestion using the regional catalog and conservative access limits.
 *
 * @returns A public-transit, walking, or direct-taxi option for the pair.
 * The caller should use `resolveTransitBetweenPlaces` when Truxdi route matching is required.
 */
export function getTransitBetweenPlaces(
  origin: Place,
  destination: Place,
  urbanFare = 2.5
): TransitOption {
  const transit = getTransitBetweenPlacesBase(origin, destination, urbanFare);
  if (
    (
      transit.vehicleType === 'micro' ||
      transit.vehicleType === 'combi' ||
      transit.vehicleType === 'colectivo'
    ) &&
    (
      haversineKm(origin.lat, origin.lon, transit.boardingPoint[0], transit.boardingPoint[1]) >
        MAX_TRANSIT_WALK_KM ||
      haversineKm(transit.dropoffPoint[0], transit.dropoffPoint[1], destination.lat, destination.lon) >
        MAX_TRANSIT_WALK_KM
    )
  ) {
    return enrichTransitOption(
      getDirectTaxiOption(
        origin,
        destination,
        'El paradero queda a más de 800 m a pie o el acceso no se pudo validar; taxi directo recomendado.'
      )
    );
  }
  return enrichTransitOption(transit);
}

function getTransitFallbackWithoutTruxdi(
  origin: Place,
  destination: Place,
  urbanFare: number
): TransitOption {
  return enrichTransitOption(getTransitBetweenPlacesBase(origin, destination, urbanFare));
}

/** Builds a direct taxi suggestion with an estimated fare range for a destination pair. */
export function getDirectTaxiOption(
  origin: Place,
  destination: Place,
  accessNote?: string
): TransitOption {
  const distanceKm = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon);
  const taxi = calculateTaxiEstimate(distanceKm);
  return {
    code: 'TAXI',
    serviceName: 'Taxi directo / aplicativo',
    vehicleType: 'taxi',
    farePen: taxi.fareAvg,
    fareRangePen: [taxi.fareMin, taxi.fareMax],
    estimatedMinutes: taxi.estimatedMinutes,
    waitMinutes: 0,
    routeColor: getRouteColor('TAXI-DIRECTO'),
    routeCode: 'TAXI',
    companyName: 'Taxi / aplicativo',
    badgeColor: '#A16207',
    boardingStop: `Punto de partida (${origin.name})`,
    dropoffStop: `Destino (${destination.name})`,
    boardingPoint: [origin.lat, origin.lon],
    dropoffPoint: [destination.lat, destination.lon],
    instructions: 'Viaje directo en taxi.',
    warning: accessNote,
    confidence: 'media',
    source: 'Estimación de taxi por distancia',
  };
}

/**
 * Validates walking access to fallback transit stops and switches to taxi when access is too long.
 */
export async function getFallbackTransitWithAccessLimit(
  origin: Place,
  destination: Place,
  urbanFare: number
): Promise<TransitOption> {
  const transit = getTransitFallbackWithoutTruxdi(origin, destination, urbanFare);
  if (
    transit.vehicleType !== 'micro' &&
    transit.vehicleType !== 'combi' &&
    transit.vehicleType !== 'colectivo'
  ) {
    return transit;
  }

  const accessDistances = [
    haversineKm(origin.lat, origin.lon, transit.boardingPoint[0], transit.boardingPoint[1]),
    haversineKm(transit.dropoffPoint[0], transit.dropoffPoint[1], destination.lat, destination.lon),
  ];
  const accessRoutes = await Promise.all(
    accessDistances.map((distanceKm, index) => {
      if (distanceKm <= 0.05) return Promise.resolve(null);
      return index === 0
        ? getWalkingRoute([origin.lat, origin.lon], transit.boardingPoint)
        : getWalkingRoute(transit.dropoffPoint, [destination.lat, destination.lon]);
    })
  );
  const tooFarToWalk = accessDistances.some((distanceKm, index) => {
    const route = accessRoutes[index];
    if (route) {
      return isTransitWalkOverLimitKm(route.distanceKm) ||
        (route.isFallback && isTransitWalkOverLimitKm(distanceKm));
    }
    return isTransitWalkOverLimitKm(distanceKm);
  });

  return tooFarToWalk
    ? enrichTransitOption(
        getDirectTaxiOption(
          origin,
          destination,
          'El paradero queda a más de 800 m a pie o el acceso no se pudo validar; taxi directo recomendado.'
        )
      )
    : transit;
}
