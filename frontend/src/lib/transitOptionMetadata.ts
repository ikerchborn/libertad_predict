/** Adds stable labels, colors, and stop landmarks to a selected transit option. */
import type { TransitOption } from '@/lib/transitTypes';
import { cleanLandmarkHint, cleanTransitCopy } from '@/lib/transitCatalog';
import { getCatalogStops, getRouteColor, TEXT_ON_DARK } from '@/lib/transitCatalogData';

function getTransitIdentity(code: string): {
  routeCode: string;
  companyName: string;
  badgeColor: string;
} {
  const identities: Record<string, { routeCode: string; companyName: string; badgeColor: string }> = {
    'M-06 B': { routeCode: 'B', companyName: 'Micro Huanchaco', badgeColor: '#1D4ED8' },
    'M-04 A': { routeCode: 'A', companyName: 'Micro Huanchaco', badgeColor: '#0369A1' },
    'C-27 B': { routeCode: 'B', companyName: 'Combi Huanchaco', badgeColor: '#047857' },
    'C-14 S': { routeCode: 'S', companyName: 'Combi Línea S', badgeColor: '#7E22CE' },
    'TAXI-LOCAL': { routeCode: 'TAXI', companyName: 'Taxi local', badgeColor: '#A16207' },
    'TAXI-DIRECTO': { routeCode: 'TAXI', companyName: 'Taxi / aplicativo', badgeColor: '#A16207' },
    TAXI: { routeCode: 'TAXI', companyName: 'Taxi / aplicativo', badgeColor: '#A16207' },
    'RUTA-CAO': { routeCode: 'CAO', companyName: 'Transporte a El Brujo', badgeColor: '#854D0E' },
    'INTER-CHICAMA': { routeCode: 'IC', companyName: 'Chicama Express', badgeColor: '#854D0E' },
    'ANDINO-HUAMACHUCO': { routeCode: 'AH', companyName: 'Bus interandino', badgeColor: '#0369A1' },
    'RUTA-EL-BRUJO': { routeCode: 'EL BRUJO', companyName: 'Conexión a El Brujo', badgeColor: '#047857' },
  };
  return identities[code] ?? {
    routeCode: code,
    companyName: code,
    badgeColor: getRouteColor(code),
  };
}

function getLandmarkHint(stopName: string, address?: string): string | undefined {
  const stop = getCatalogStops().find((candidate) => candidate.name === stopName);
  if (stop?.landmark_hint) return stop.landmark_hint;
  return address ?? stop?.address;
}

/**
 * Fills missing display metadata and sanitizes labels for a transit option and every leg.
 *
 * Existing catalog-provided values take precedence over derived defaults.
 */
export function enrichTransitOption(transit: TransitOption): TransitOption {
  const identity = getTransitIdentity(transit.code);
  const boardingStop = cleanTransitCopy(transit.boardingStop) ?? transit.boardingStop;
  const dropoffStop = cleanTransitCopy(transit.dropoffStop) ?? transit.dropoffStop;
  return {
    ...transit,
    serviceName: cleanTransitCopy(transit.serviceName) ?? transit.serviceName,
    headsign: cleanTransitCopy(transit.headsign),
    boardingStop,
    dropoffStop,
    routeCode: cleanTransitCopy(transit.routeCode ?? identity.routeCode) ?? identity.routeCode,
    companyName: cleanTransitCopy(transit.companyName ?? identity.companyName) ?? identity.companyName,
    badgeColor: transit.badgeColor ?? identity.badgeColor,
    textColor: transit.textColor ?? TEXT_ON_DARK,
    routeColor: transit.routeColor ?? transit.badgeColor ?? identity.badgeColor,
    boardingLandmarkHint: cleanLandmarkHint(
      boardingStop,
      transit.boardingLandmarkHint ?? getLandmarkHint(boardingStop)
    ),
    dropoffLandmarkHint: cleanLandmarkHint(
      dropoffStop,
      transit.dropoffLandmarkHint ?? getLandmarkHint(dropoffStop)
    ),
    routeLegs: transit.routeLegs?.map((leg) => {
      const legIdentity = getTransitIdentity(leg.code);
      const legBoardingStop = cleanTransitCopy(leg.boardingStop) ?? leg.boardingStop;
      const legDropoffStop = cleanTransitCopy(leg.dropoffStop) ?? leg.dropoffStop;
      return {
        ...leg,
        serviceName: cleanTransitCopy(leg.serviceName) ?? leg.serviceName,
        boardingStop: legBoardingStop,
        dropoffStop: legDropoffStop,
        routeCode: cleanTransitCopy(leg.routeCode ?? legIdentity.routeCode) ?? legIdentity.routeCode,
        companyName: cleanTransitCopy(leg.companyName ?? legIdentity.companyName) ?? legIdentity.companyName,
        badgeColor: leg.badgeColor ?? legIdentity.badgeColor,
        textColor: leg.textColor ?? TEXT_ON_DARK,
        routeColor: leg.routeColor ?? leg.badgeColor ?? legIdentity.badgeColor,
        boardingLandmarkHint: cleanLandmarkHint(
          legBoardingStop,
          leg.boardingLandmarkHint ?? getLandmarkHint(legBoardingStop)
        ),
        dropoffLandmarkHint: cleanLandmarkHint(
          legDropoffStop,
          leg.dropoffLandmarkHint ?? getLandmarkHint(legDropoffStop)
        ),
      };
    }),
  };
}
