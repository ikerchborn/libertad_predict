import type { Place } from '@/lib/types';
import { haversineKm } from '@/lib/routeOptimizer';
import transportCatalogJson from '@/data/transport_outside_trujillo.json';

type CatalogVehicleType = 'bus' | 'combi' | 'colectivo' | 'mototaxi';
type CatalogConfidence = 'alta' | 'media' | 'baja';

interface CatalogStop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface CatalogRoute {
  id: string;
  code: string;
  serviceName: string;
  vehicleType: CatalogVehicleType;
  farePen: number;
  fareRangePen: [number, number];
  estimatedMinutes: number;
  distanceKm: number;
  boardingStopId: string;
  dropoffStopId: string;
  confidence: CatalogConfidence;
  source: string;
}

interface TransportCatalog {
  stops: CatalogStop[];
  routes: CatalogRoute[];
  routeLegs: Array<{
    id: string;
    totalEstimatedMinutes: number;
    totalFarePen: number;
    legs: Array<{ routeId: string }>;
    confidence: CatalogConfidence;
    source: string;
  }>;
}

const transportCatalog = transportCatalogJson as unknown as TransportCatalog;
const catalogStops = new Map(transportCatalog.stops.map((stop) => [stop.id, stop]));
const catalogRoutes = new Map(transportCatalog.routes.map((route) => [route.id, route]));

export interface TransitOption {
  code: string;
  serviceName: string;
  headsign?: string;
  vehicleType: 'micro' | 'combi' | 'bus' | 'colectivo' | 'mototaxi' | 'caminata' | 'taxi';
  farePen: number;
  estimatedMinutes: number;
  boardingStop: string;
  dropoffStop: string;
  boardingPoint: [number, number];
  dropoffPoint: [number, number];
  instructions: string;
  fareRangePen?: [number, number];
  confidence?: CatalogConfidence;
  source?: string;
  routeLegs?: Array<{
    serviceName: string;
    vehicleType: 'bus' | 'colectivo' | 'mototaxi';
    farePen: number;
    estimatedMinutes: number;
    boardingStop: string;
    dropoffStop: string;
    boardingPoint: [number, number];
    dropoffPoint: [number, number];
  }>;
}

const CHICAMA_FARE = 12.0;
const EL_BRUJO_FARE = 10.0;
const HUAMACHUCO_FARE = 30.0;

const TRANSIT_STOPS = {
  mansiche: [-8.1028, -79.0448] as [number, number],
  huanchaco: [-8.0786, -79.1214] as [number, number],
  chanChan: [-8.1099, -79.0745] as [number, number],
  museoChanChan: [-8.1000, -79.0657] as [number, number],
  grau: [-8.1267, -78.9954] as [number, number],
  moche: [-8.1336, -78.9909] as [number, number],
  chicama: [-7.6944, -79.4389] as [number, number],
  santaCruz: [-8.1018, -79.0286] as [number, number],
  brujo: [-7.9158, -79.3039] as [number, number],
  huamachuco: [-7.8152, -78.0501] as [number, number],
} as const;

function getZone(place: Place): string {
  const name = place.name.toLowerCase();
  const address = (place.address || '').toLowerCase();
  const text = `${name} ${address}`;

  if (
    text.includes('chan chan') ||
    text.includes('nik an') ||
    (place.lat > -8.115 && place.lat < -8.10 && place.lon < -79.065)
  ) return 'chan_chan';
  if (
    text.includes('huanchaco') ||
    (place.lat > -8.10 && place.lat < -8.02 && place.lon < -79.11)
  ) return 'huanchaco';
  if (text.includes('moche') || text.includes('sol y luna') || text.includes('ai apaec') || place.lat < -8.13) return 'moche';
  if (text.includes('brujo') || text.includes('magdalena de cao') || text.includes('señora de cao')) return 'el_brujo';
  if (text.includes('chocope') || (place.lat > -7.85 && place.lat < -7.74 && place.lon < -79.18)) return 'chocope';
  if (text.includes('pacasmayo') || (place.lat > -7.55 && place.lat < -7.25)) return 'pacasmayo';
  if (text.includes('chicama') || text.includes('malabrigo') || (place.lat > -7.8 && place.lon < -79.28)) return 'chicama';
  if (text.includes('salaverry') || (place.lat < -8.18 && place.lon > -79.1)) return 'salaverry';
  if (text.includes('huamachuco') || text.includes('marcahuamachuco') || place.lon > -78.2) return 'huamachuco';
  return 'centro';
}

function reverseRoute(route: CatalogRoute, reverse: boolean): TransitOption {
  const boarding = catalogStops.get(reverse ? route.dropoffStopId : route.boardingStopId);
  const dropoff = catalogStops.get(reverse ? route.boardingStopId : route.dropoffStopId);
  if (!boarding || !dropoff) {
    throw new Error(`El catálogo de transporte no tiene paraderos para ${route.id}`);
  }

  return {
    code: route.code,
    serviceName: route.serviceName,
    vehicleType: route.vehicleType,
    farePen: route.farePen,
    fareRangePen: route.fareRangePen,
    estimatedMinutes: route.estimatedMinutes,
    boardingStop: boarding.name,
    dropoffStop: dropoff.name,
    boardingPoint: [boarding.latitude, boarding.longitude],
    dropoffPoint: [dropoff.latitude, dropoff.longitude],
    instructions: `Ruta ${reverse ? 'de retorno' : 'de salida'} desde ${boarding.name}. Tarifa referencial; confirmar en el terminal.`,
    confidence: route.confidence,
    source: route.source,
  };
}

function getCatalogRoute(
  fromZone: string,
  toZone: string
): TransitOption | null {
  const directRoutes: Array<[string, string, string]> = [
    ['chicama', 'trujillo', 'trujillo-puerto-chicama'],
    ['chocope', 'trujillo', 'trujillo-chocope'],
    ['pacasmayo', 'trujillo', 'trujillo-pacasmayo'],
    ['salaverry', 'trujillo', 'trujillo-salaverry'],
    ['huanchaco', 'trujillo', 'trujillo-huanchaco'],
  ];
  const trujilloArea = new Set(['centro', 'huanchaco', 'chan_chan', 'moche', 'salaverry']);

  for (const [outsideZone, cityZone, routeId] of directRoutes) {
    if (
      (fromZone === outsideZone && trujilloArea.has(toZone)) ||
      (toZone === outsideZone && trujilloArea.has(fromZone))
    ) {
      const route = catalogRoutes.get(routeId);
      if (route) return reverseRoute(route, fromZone === outsideZone);
    }
  }

  if (
    (trujilloArea.has(fromZone) && toZone === 'el_brujo') ||
    (fromZone === 'el_brujo' && trujilloArea.has(toZone))
  ) {
    const legPlan = transportCatalog.routeLegs.find((plan) => plan.id === 'trujillo-el-brujo');
    if (!legPlan) return null;
    const legs = legPlan.legs.map((leg) => catalogRoutes.get(leg.routeId)).filter(Boolean) as CatalogRoute[];
    if (legs.length !== legPlan.legs.length) return null;
    const reverse = fromZone === 'el_brujo';
    const first = reverseRoute(legs[0], false);
    const last = reverseRoute(legs[legs.length - 1], false);
    const routeLegOptions = (reverse ? [...legs].reverse() : legs).map((leg) =>
      reverseRoute(leg, reverse)
    );
    return {
      ...first,
      code: 'RUTA-EL-BRUJO',
      serviceName: 'Bus + colectivo + mototaxi hacia El Brujo',
      vehicleType: 'bus',
      farePen: legPlan.totalFarePen,
      fareRangePen: [
        legs.reduce((total, leg) => total + leg.fareRangePen[0], 0),
        legs.reduce((total, leg) => total + leg.fareRangePen[1], 0),
      ],
      estimatedMinutes: legPlan.totalEstimatedMinutes,
      boardingStop: reverse ? last.dropoffStop : first.boardingStop,
      dropoffStop: reverse ? first.boardingStop : last.dropoffStop,
      boardingPoint: reverse ? last.dropoffPoint : first.boardingPoint,
      dropoffPoint: reverse ? first.boardingPoint : last.dropoffPoint,
      instructions: 'Tramo oficial: Trujillo → Chocope → Magdalena de Cao → El Brujo. Debes hacer dos transbordos.',
      confidence: legPlan.confidence,
      source: legPlan.source,
      routeLegs: routeLegOptions.map((leg) => ({
        serviceName: leg.serviceName,
        vehicleType: leg.vehicleType as 'bus' | 'colectivo' | 'mototaxi',
        farePen: leg.farePen,
        estimatedMinutes: leg.estimatedMinutes,
        boardingStop: leg.boardingStop,
        dropoffStop: leg.dropoffStop,
        boardingPoint: leg.boardingPoint,
        dropoffPoint: leg.dropoffPoint,
      })),
    };
  }

  if (
    (trujilloArea.has(fromZone) && toZone === 'huamachuco') ||
    (fromZone === 'huamachuco' && trujilloArea.has(toZone))
  ) {
    const route = catalogRoutes.get('trujillo-huamachuco');
    if (route) return reverseRoute(route, fromZone === 'huamachuco');
  }

  return null;
}

/**
 * Resolves available public-transit references and marks unsupported city pairs as unverified.
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

export function getTransitBetweenPlaces(
  origin: Place,
  destination: Place,
  urbanFare = 2.5
): TransitOption {
  const dist = haversineKm(origin.lat, origin.lon, destination.lat, destination.lon);
  const fromZone = getZone(origin);
  const toZone = getZone(destination);

  const catalogOption = getCatalogRoute(fromZone, toZone);
  if (catalogOption) return catalogOption;

  // Short distance: Walking or local combi
  if (dist <= 1.2) {
    return {
      code: 'WALK',
      serviceName: 'Caminata Peatonal',
      vehicleType: 'caminata',
      farePen: 0,
      estimatedMinutes: Math.max(5, Math.round((dist / 4.5) * 60)),
      boardingStop: origin.name,
      dropoffStop: destination.name,
      boardingPoint: [origin.lat, origin.lon],
      dropoffPoint: [destination.lat, destination.lon],
      instructions: `Recorrido a pie de ${dist.toFixed(1)} km por jirones céntricos o calles peatonales.`,
    };
  }

  // Chan Chan <-> Museo de Sitio Chan Chan (dentro del mismo complejo arqueológico)
  if (
    (origin.id === 3 && destination.id === 415) ||
    (origin.id === 415 && destination.id === 3) ||
    (fromZone === 'chan_chan' && toZone === 'chan_chan' && dist < 3.0)
  ) {
    return {
      code: 'TAXI-LOCAL',
      serviceName: 'Taxi local / Mototaxi o Caminata',
      vehicleType: 'taxi',
      farePen: 5.0,
      fareRangePen: [4.0, 7.0],
      estimatedMinutes: 5,
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
      serviceName: 'Microbús Línea B ("La B de Huanchaco")',
      headsign: 'Huanchaco (referencial)',
      vehicleType: 'micro',
      farePen: urbanFare,
      estimatedMinutes: 30,
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
      serviceName: 'Microbús Línea A / B de Huanchaco',
      headsign: 'Huanchaco (referencial)',
      vehicleType: 'micro',
      farePen: urbanFare,
      estimatedMinutes: 20,
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
      serviceName: 'Combi Línea B ("Caballito de Totora")',
      vehicleType: 'combi',
      farePen: urbanFare,
      estimatedMinutes: 12,
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
      serviceName: 'Combi Línea S ("La S de Sol y Luna")',
      vehicleType: 'combi',
      farePen: urbanFare,
      estimatedMinutes: 25,
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
      serviceName: 'Ómnibus Interprovincial Chicama Express',
      vehicleType: 'bus',
      farePen: CHICAMA_FARE,
      estimatedMinutes: 80,
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
      serviceName: 'Transporte Interprovincial Chocope - Magdalena de Cao',
      vehicleType: 'bus',
      farePen: EL_BRUJO_FARE,
      estimatedMinutes: 65,
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
      serviceName: 'Bus Interandino Negreiros / Los Andes',
      vehicleType: 'bus',
      farePen: HUAMACHUCO_FARE,
      estimatedMinutes: 240,
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
    serviceName: 'Taxi directo / Aplicativo (Yango, Uber, inDrive)',
    headsign: destination.name,
    vehicleType: 'taxi',
    farePen: taxi.fareAvg,
    fareRangePen: [taxi.fareMin, taxi.fareMax],
    estimatedMinutes: taxi.estimatedMinutes,
    boardingStop: `Punto de partida (${origin.name})`,
    dropoffStop: `Destino directo (${destination.name})`,
    boardingPoint: [origin.lat, origin.lon],
    dropoffPoint: [destination.lat, destination.lon],
    instructions: `Sin combi o micro directo para este trayecto. Te recomendamos tomar Taxi o aplicativo (Yango, Uber, inDrive). Tarifa estimada en Trujillo: S/ ${taxi.fareMin.toFixed(2)} – S/ ${taxi.fareMax.toFixed(2)} (~${taxi.estimatedMinutes} min).`,
    confidence: 'media',
    source: 'Tarifario referencial de taxis en Trujillo',
  };
}
