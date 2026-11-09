"use client";

import React, { useCallback, useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  MapPin,
  Search,
  Sparkles,
  Route,
  Navigation,
  Compass,
  Hotel,
  Trash2,
  Plus,
  GripVertical,
  Clock,
  Utensils,
  Landmark,
  Compass as ActivityIcon,
  Check,
  FileText,
  Sun,
  Waves,
  FolderKanban,
  Copy,
  X,
  ExternalLink,
  Globe,
  Phone,
  BusFront,
  CarFront,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PLACE_IMAGES, type Place, type PlaceKind, type PlaceDetail } from "@/lib/types";
import { fetchPlaceById, fetchPlaces } from "@/lib/api";
import { useTripCache } from "@/hooks/useTripCache";
import {
  haversineKm,
  MAX_OPTIMIZABLE_STOPS,
  optimizeDayRoute,
} from "@/lib/routeOptimizer";
import { fetchOsrmRoute } from "@/lib/osrmService";
import {
  estimateTransitCostMinutes,
  getTransitAlternatives,
  getTransitBetweenPlaces,
  resolveTransitBetweenPlaces,
  type TransitOption,
} from "@/lib/transitService";
import type { MapRouteSegment } from "@/components/PlaceMap";
import PlaceMap from "@/components/PlaceMap";
import { getLocalImageUrl, getSafeExternalUrl } from "@/lib/safeUrl";

interface HomePlacesClientProps {
  initialPlaces: Place[];
  initialDate: string;
  availableDates: string[];
}

const EMPTY_ROUTE_PLACES: Place[] = [];

function formatTripDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return `${startDate} – ${endDate}`;
  }

  const monthYear = new Intl.DateTimeFormat("es-PE", {
    month: "short",
    year: "numeric",
  });
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return `${start.getDate()} – ${end.getDate()} ${monthYear.format(end)}`;
  }

  const fullDate = new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${fullDate.format(start)} – ${fullDate.format(end)}`;
}

function getLegId(index: number): string {
  return String.fromCharCode(65 + index);
}

function getUsefulLandmarkHint(stop: string, hint?: string): string | undefined {
  if (!hint || /sin referencia física publicada/i.test(hint)) return undefined;
  let conciseHint = hint
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s*\(referencial\)/gi, "")
    .split(/;\s*(?:confirma|referencia aproximada|punto referencial)/i)[0]
    .trim();
  if (conciseHint.toLowerCase().startsWith(stop.trim().toLowerCase())) {
    conciseHint = conciseHint
      .slice(stop.trim().length)
      .replace(/^[\s().·—:;,.–-]+|[\s().·—:;,.–-]+$/g, "")
      .trim();
  }
  return conciseHint || undefined;
}

function getTransitPairKey(origin: Place, destination: Place): string {
  return `${origin.id}>${destination.id}`;
}

function formatPlannerDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function getTripDuration(startDate: string, endDate: string): {
  dayCount: number;
  nightCount: number;
} {
  const start = Date.parse(`${startDate}T00:00:00`);
  const end = Date.parse(`${endDate}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { dayCount: 1, nightCount: 0 };
  }
  const nights = Math.round((end - start) / 86_400_000);
  return { dayCount: nights + 1, nightCount: nights };
}

export function HomePlacesClient({
  initialPlaces,
  initialDate,
  availableDates,
}: HomePlacesClientProps) {
  const {
    trip,
    activeDay,
    additionalDayDates,
    isHydrated,
    savedTrips,
    createNewTrip,
    switchTrip,
    deleteTrip,
    deleteAllTrips,
    duplicateTrip,
    renameTrip,
    addDay,
    removeDay,
    setActiveDayId,
    addPlaceToDay,
    removePlaceFromDay,
    reorderPlaces,
    setDayPlaces,
    setHotelAnchor,
    setTripDetails,
    setIsStarted,
    setNotes,
  } = useTripCache();

  // Multi-trip drawer and rename states
  const [isTripsDrawerOpen, setIsTripsDrawerOpen] = useState(false);
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false);
  const [placeToAdd, setPlaceToAdd] = useState<Place | null>(null);
  const [selectedMapPlace, setSelectedMapPlace] = useState<Place | null>(null);
  const [selectedTransitRoute, setSelectedTransitRoute] =
    useState<MapRouteSegment | null>(null);
  const [transitImageFailed, setTransitImageFailed] = useState(false);
  const [selectedMapPlaceDetail, setSelectedMapPlaceDetail] =
    useState<PlaceDetail | null>(null);
  const [isSelectedMapPlaceExpanded, setIsSelectedMapPlaceExpanded] =
    useState(false);
  const [selectedMapPlaceDetailStatus, setSelectedMapPlaceDetailStatus] =
    useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [newTripTitleInput, setNewTripTitleInput] = useState(trip.title || `Viaje a ${trip.destination || "Trujillo"}`);
  const [newTripDestinationModal, setNewTripDestinationModal] = useState("");
  const [newDayDate, setNewDayDate] = useState("");
  const [notesSaveStatus, setNotesSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isMapVisible, setIsMapVisible] = useState(true);

  // Working Date inputs: default to real dates
  const defaultStart = availableDates[0] || initialDate || "2026-11-06";
  const defaultEnd =
    availableDates[Math.min(availableDates.length - 1, 4)] || "2026-11-10";

  const [destInput, setDestInput] = useState(trip.destination || "Trujillo");
  const [startDateInput, setStartDateInput] = useState(
    trip.startDate || defaultStart
  );
  const [endDateInput, setEndDateInput] = useState(trip.endDate || defaultEnd);
  const startTimestamp = Date.parse(`${startDateInput}T00:00:00`);
  const endTimestamp = Date.parse(`${endDateInput}T00:00:00`);
  const tripNights =
    Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp)
      ? Math.max(0, Math.round((endTimestamp - startTimestamp) / 86_400_000))
      : 0;
  const [compactMode, setCompactMode] = useState(false);
  const [loadedForecast, setLoadedForecast] = useState<{
    date: string;
    places: Place[];
  } | null>(null);

  // Responsive mobile / tablet view switcher
  const [mobileTab, setMobileTab] = useState<"itinerary" | "map">("itinerary");

  // Places List filters & pagination
  const [listCategory, setListCategory] = useState<"all" | PlaceKind>("attraction");
  const [listZone, setListZone] = useState<"all" | "costa" | "valle" | "sierra">(
    "all"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [displayCount, setDisplayCount] = useState(10);

  // Route calculation state
  const [isCalculating, setIsCalculating] = useState(false);
  const [optimizationError, setOptimizationError] = useState<string | null>(null);
  const [routeStats, setRouteStats] = useState<{ km: number; min: number } | null>(
    null
  );
  const [routeSegments, setRouteSegments] = useState<MapRouteSegment[]>([]);
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null);
  const [optimizationProgress, setOptimizationProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const optimizationRunRef = useRef(0);
  const [resolvedTransitOptions, setResolvedTransitOptions] = useState<
    Record<string, TransitOption>
  >({});
  const [selectedTransitModes, setSelectedTransitModes] = useState<
    Record<string, "transit" | "direct-taxi">
  >({});
  const [urbanFare, setUrbanFare] = useState(2.5);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Ref to scroll to places list when clicking guide cards
  const placesListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/transit/fare")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Tarifa API respondió ${response.status}`);
        const data = (await response.json()) as { urbanBaseFare?: unknown };
        if (typeof data.urbanBaseFare !== "number" || data.urbanBaseFare <= 0) {
          throw new Error("La API tarifaria devolvió un importe inválido");
        }
        if (isMounted) setUrbanFare(data.urbanBaseFare);
      })
      .catch((error: unknown) => {
        console.error("No se pudo cargar la tarifa urbana del catálogo GTFS:", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || !activeDay) return;
    let isCurrent = true;
    const legs = activeDay.places.slice(0, -1).map((origin, index) => {
      const destination = activeDay.places[index + 1];
      return { key: getTransitPairKey(origin, destination), origin, destination };
    });

    Promise.all(
      legs.map(async ({ key, origin, destination }) => [
        key,
        await resolveTransitBetweenPlaces(origin, destination, urbanFare),
      ] as const)
    )
      .then((entries) => {
        if (isCurrent) setResolvedTransitOptions(Object.fromEntries(entries));
      })
      .catch((error: unknown) => {
        console.error("No se pudieron validar las rutas peatonales del itinerario:", error);
      });

    return () => {
      isCurrent = false;
    };
  }, [isHydrated, activeDay, urbanFare]);

  const getSelectedTransit = useCallback((origin: Place, destination: Place): TransitOption => {
    const key = getTransitPairKey(origin, destination);
    const transit =
      resolvedTransitOptions[key] ??
      getTransitBetweenPlaces(origin, destination, urbanFare);
    if (selectedTransitModes[key] !== "direct-taxi") return transit;
    return getTransitAlternatives(origin, destination, transit).find(
      (alternative) => alternative.id === "direct-taxi"
    )?.transit ?? transit;
  }, [resolvedTransitOptions, selectedTransitModes, urbanFare]);

  // Recalculate OSRM route whenever active day's places or travel mode change
  useEffect(() => {
    if (!isHydrated || !activeDay) return;

    let isMounted = true;
    async function calculate() {
      if (activeDay.places.length < 2) {
        setRouteStats(null);
        setRouteSegments([]);
        return;
      }

      setIsCalculating(true);
      const segmentInputs: Array<{
        routeId?: string;
        legId?: string;
        origin: [number, number];
        destination: [number, number];
        mode: "walking" | "driving";
        kind: MapRouteSegment["kind"];
        label: string;
        tripLabel?: string;
        estimatedMinutes?: number;
        waitMinutes?: number;
        farePen?: number;
        fareRangePen?: [number, number];
        routeGeometry?: [number, number][];
        routeGeometryVerified?: boolean;
        routeColor?: string;
        routeCode?: string;
        companyName?: string;
        badgeColor?: string;
        textColor?: string;
        vehicleType?: MapRouteSegment["vehicleType"];
        vehicleImageUrl?: string;
        boardingStop?: string;
        dropoffStop?: string;
        boardingLandmarkHint?: string;
        dropoffLandmarkHint?: string;
        walkPhase?: "to-board" | "transfer" | "to-place";
        isApproximate?: boolean;
      }> = [];

      if (trip.hotelAnchor) {
        const firstPlace = activeDay.places[0];
        segmentInputs.push({
          routeId: `${activeDay.id}-hotel-anchor`,
          origin: [trip.hotelAnchor.lat, trip.hotelAnchor.lon],
          destination: [firstPlace.lat, firstPlace.lon],
          mode: trip.travelMode,
          kind: trip.travelMode === "walking" ? "walking" : "driving",
          label: "Ruta desde el hospedaje",
        });
      }

      for (let i = 0; i < activeDay.places.length - 1; i++) {
        const origin = activeDay.places[i];
        const destination = activeDay.places[i + 1];
        const transit = getSelectedTransit(origin, destination);
        const legId = getLegId(i);
        const routeId = `${activeDay.id}-leg-${legId}`;
        const tripLabel = `Leg ${legId} · ${origin.name} → ${destination.name}`;
        if (transit.vehicleType === "caminata") {
          segmentInputs.push({
            routeId,
            legId,
            origin: [origin.lat, origin.lon],
            destination: [destination.lat, destination.lon],
            mode: "walking",
            kind: "walking",
            label: `${transit.code === "WALK-INTERNAL" ? "Sendero peatonal interno" : "Camina"}: ${origin.name} → ${destination.name}`,
            tripLabel,
            estimatedMinutes: transit.estimatedMinutes,
            routeGeometry: transit.routeGeometry,
            routeGeometryVerified: transit.routeGeometryVerified,
            walkPhase: "to-place",
          });
          continue;
        }

        if (transit.vehicleType === "taxi") {
          segmentInputs.push({
            routeId,
            legId,
            origin: [origin.lat, origin.lon],
            destination: [destination.lat, destination.lon],
            mode: "driving",
            kind: "transit",
            label: `${transit.serviceName}: ${origin.name} → ${destination.name}`,
            tripLabel,
            estimatedMinutes: transit.estimatedMinutes,
            waitMinutes: 0,
            farePen: transit.farePen,
            fareRangePen: transit.fareRangePen,
            routeColor: transit.routeColor,
            routeCode: transit.routeCode,
            companyName: transit.companyName,
            badgeColor: transit.badgeColor,
            textColor: transit.textColor,
            vehicleType: transit.vehicleType,
            boardingStop: transit.boardingStop,
            dropoffStop: transit.dropoffStop,
            boardingLandmarkHint: transit.boardingLandmarkHint,
            dropoffLandmarkHint: transit.dropoffLandmarkHint,
          });
          continue;
        }

        segmentInputs.push({
          routeId,
          legId,
          origin: [origin.lat, origin.lon],
          destination: transit.boardingPoint,
          mode: "walking",
          kind: "walking",
          label: `Camina desde ${origin.name} hasta ${transit.boardingStop}`,
          tripLabel,
          walkPhase: "to-board",
        });

        if (transit.routeLegs?.length) {
          transit.routeLegs.forEach((leg, legIndex) => {
            const previousLeg = transit.routeLegs?.[legIndex - 1];
            if (previousLeg) {
              segmentInputs.push({
                routeId,
                legId,
                origin: previousLeg.dropoffPoint,
                destination: leg.boardingPoint,
                mode: "walking",
                kind: "walking",
                label: `Camina entre paraderos: ${previousLeg.dropoffStop} → ${leg.boardingStop}`,
                tripLabel,
                walkPhase: "transfer",
              });
            }
            segmentInputs.push({
              routeId,
              legId,
              origin: leg.boardingPoint,
              destination: leg.dropoffPoint,
              mode: "driving",
              kind: "transit",
              label: `${leg.serviceName}: ${leg.boardingStop} → ${leg.dropoffStop}`,
              tripLabel,
              estimatedMinutes: leg.estimatedMinutes,
              waitMinutes: leg.waitMinutes,
              farePen: transit.farePen,
              fareRangePen: transit.fareRangePen,
              routeGeometry: leg.routeGeometry,
              routeGeometryVerified: leg.routeGeometryVerified,
              routeColor: leg.routeColor,
              routeCode: leg.routeCode,
              companyName: leg.companyName,
              badgeColor: leg.badgeColor,
              textColor: leg.textColor,
              vehicleType: leg.vehicleType,
              vehicleImageUrl: transit.vehicleImageUrl,
              boardingStop: leg.boardingStop,
              dropoffStop: leg.dropoffStop,
              boardingLandmarkHint: leg.boardingLandmarkHint,
              dropoffLandmarkHint: leg.dropoffLandmarkHint,
              isApproximate: !leg.routeGeometryVerified || !leg.routeGeometry,
            });
          });
        } else {
          segmentInputs.push({
            routeId,
            legId,
            origin: transit.boardingPoint,
            destination: transit.dropoffPoint,
            mode: "driving",
            kind: "transit",
            label: `${transit.serviceName}: ${transit.boardingStop} → ${transit.dropoffStop}`,
            tripLabel,
            estimatedMinutes: transit.estimatedMinutes,
            waitMinutes: transit.waitMinutes,
            farePen: transit.farePen,
            fareRangePen: transit.fareRangePen,
            routeGeometry: transit.routeGeometry,
            routeGeometryVerified: transit.routeGeometryVerified,
            routeColor: transit.routeColor,
            routeCode: transit.routeCode,
            companyName: transit.companyName,
            badgeColor: transit.badgeColor,
            textColor: transit.textColor,
            vehicleType: transit.vehicleType,
            vehicleImageUrl: transit.vehicleImageUrl,
            boardingStop: transit.boardingStop,
            dropoffStop: transit.dropoffStop,
            boardingLandmarkHint: transit.boardingLandmarkHint,
            dropoffLandmarkHint: transit.dropoffLandmarkHint,
            isApproximate: !transit.routeGeometryVerified || !transit.routeGeometry,
          });
        }

        segmentInputs.push({
          routeId,
          legId,
          origin: transit.dropoffPoint,
          destination: [destination.lat, destination.lon],
          mode: "walking",
          kind: "walking",
          label: `Camina desde ${transit.dropoffStop} hasta ${destination.name}`,
          tripLabel,
          walkPhase: "to-place",
        });
      }

      if (trip.hotelAnchor) {
        const lastPlace = activeDay.places[activeDay.places.length - 1];
        segmentInputs.push({
          routeId: `${activeDay.id}-hotel-return`,
          origin: [lastPlace.lat, lastPlace.lon],
          destination: [trip.hotelAnchor.lat, trip.hotelAnchor.lon],
          mode: trip.travelMode,
          kind: trip.travelMode === "walking" ? "walking" : "driving",
          label: "Regreso al hospedaje",
        });
      }

      const segmentResults = await Promise.all(
        segmentInputs.map(async (segment) => {
          const routeGeometry = segment.routeGeometry;
          if (routeGeometry) {
            const distanceKm = routeGeometry.slice(1).reduce(
              (total, point, index) =>
                total +
                haversineKm(
                  routeGeometry[index][0],
                  routeGeometry[index][1],
                  point[0],
                  point[1]
                ),
              0
            );
            return {
              ...segment,
              route: {
                coordinates: routeGeometry,
                distanceKm,
                durationMin: segment.estimatedMinutes ?? 0,
                isFallback: !segment.routeGeometryVerified,
              },
            };
          }
          if (segment.kind === "transit" && segment.vehicleType !== "taxi") {
            return {
              ...segment,
              route: {
                coordinates: [segment.origin, segment.destination],
                distanceKm: haversineKm(
                  segment.origin[0],
                  segment.origin[1],
                  segment.destination[0],
                  segment.destination[1]
                ),
                durationMin: segment.estimatedMinutes ?? 0,
                isFallback: true,
              },
            };
          }
          return {
            ...segment,
            route: await fetchOsrmRoute(
              [segment.origin, segment.destination],
              segment.mode
            ),
          };
        })
      );
      if (isMounted) {
        const stats = segmentResults.reduce(
          (total, segment) => {
            const distanceKm =
              segment.route?.distanceKm ??
              haversineKm(
                segment.origin[0],
                segment.origin[1],
                segment.destination[0],
                segment.destination[1]
              );
            const estimatedMinutes =
              segment.kind === "transit"
                ? (segment.estimatedMinutes ?? segment.route?.durationMin ?? 0) +
                  (segment.waitMinutes ?? 0)
                : segment.kind === "walking"
                  ? segment.estimatedMinutes ??
                    Math.max(1, Math.round((distanceKm / 4.5) * 60))
                  : segment.route?.durationMin ?? 0;
            return {
              km: total.km + distanceKm,
              min: total.min + estimatedMinutes,
            };
          },
          { km: 0, min: 0 }
        );
        setRouteStats(stats);
        setRouteSegments(
          segmentResults
            .map((segment) => ({
              routeId: segment.routeId,
              legId: segment.legId,
              kind: segment.kind,
              coordinates: segment.route?.coordinates ?? [segment.origin, segment.destination],
              label: segment.label,
              distanceKm: segment.route?.distanceKm,
              tripLabel: segment.tripLabel,
              estimatedMinutes:
                segment.kind === "walking"
                  ? segment.estimatedMinutes ??
                    Math.max(
                      1,
                      Math.round(((segment.route?.distanceKm ?? 0) / 4.5) * 60)
                    )
                  : segment.estimatedMinutes,
              waitMinutes: segment.waitMinutes,
              farePen: segment.farePen,
              fareRangePen: segment.fareRangePen,
              routeColor: segment.routeColor,
              routeCode: segment.routeCode,
              companyName: segment.companyName,
              badgeColor: segment.badgeColor,
              textColor: segment.textColor,
              vehicleType: segment.vehicleType,
              vehicleImageUrl: segment.vehicleImageUrl,
              boardingStop: segment.boardingStop,
              dropoffStop: segment.dropoffStop,
              boardingLandmarkHint: segment.boardingLandmarkHint,
              dropoffLandmarkHint: segment.dropoffLandmarkHint,
              walkPhase: segment.walkPhase,
              routeGeometryVerified:
                segment.routeGeometryVerified ??
                (segment.vehicleType === "taxi" &&
                  Boolean(segment.route) &&
                  !segment.route?.isFallback),
              isApproximate:
                segment.isApproximate ??
                (segment.route?.isFallback ?? !segment.route),
              routeFallbackReason: segment.route?.fallbackReason,
            }))
        );
        setIsCalculating(false);
      }
    }

    calculate();
    return () => {
      isMounted = false;
    };
  }, [
    isHydrated,
    activeDay?.id,
    activeDay?.places,
    resolvedTransitOptions,
    selectedTransitModes,
    getSelectedTransit,
    trip.travelMode,
    trip.hotelAnchor?.id,
    urbanFare,
  ]);

  // Run 2-Opt local search heuristic on current day
  const handleOptimize = async () => {
    if (!activeDay || activeDay.places.length <= 1) return;
    if (activeDay.places.length > MAX_OPTIMIZABLE_STOPS) {
      setOptimizationError(
        `La optimización admite hasta ${MAX_OPTIMIZABLE_STOPS} paradas por día. Reduce el itinerario y vuelve a intentarlo.`
      );
      return;
    }
    setOptimizationError(null);
    const runId = ++optimizationRunRef.current;
    setIsCalculating(true);
    try {
      const candidates = trip.hotelAnchor
        ? [...activeDay.places, trip.hotelAnchor]
        : activeDay.places;
      const pairs = candidates.flatMap((origin, originIndex) =>
        candidates.flatMap((destination, destinationIndex) =>
          originIndex === destinationIndex
            ? []
            : [{ origin, destination, key: getTransitPairKey(origin, destination) }]
        )
      );
      const transitByPair = new Map<string, TransitOption>();
      setOptimizationProgress({ completed: 0, total: pairs.length });
      for (let index = 0; index < pairs.length; index += 4) {
        if (optimizationRunRef.current !== runId) return;
        const batch = pairs.slice(index, index + 4);
        const resolved = await Promise.all(
          batch.map(async ({ origin, destination, key }) => ({
            key,
            transit: await resolveTransitBetweenPlaces(origin, destination, urbanFare),
          }))
        );
        if (optimizationRunRef.current !== runId) return;
        resolved.forEach(({ key, transit }) => transitByPair.set(key, transit));
        setOptimizationProgress({
          completed: Math.min(index + batch.length, pairs.length),
          total: pairs.length,
        });
      }

      const optimized = optimizeDayRoute(
        activeDay.places,
        trip.hotelAnchor,
        (from, to) =>
          estimateTransitCostMinutes(
            from,
            to,
            urbanFare,
            15,
            transitByPair.get(getTransitPairKey(from, to))
          )
      );
      setDayPlaces(activeDay.id, optimized);
    } catch (error) {
      console.error("No se pudo optimizar la ruta multimodal:", error);
    } finally {
      if (optimizationRunRef.current === runId) {
        setIsCalculating(false);
        setOptimizationProgress(null);
      }
    }
  };

  const cancelOptimization = () => {
    optimizationRunRef.current += 1;
    setIsCalculating(false);
    setOptimizationProgress(null);
  };

  // Derive zone for filtering
  const getPlaceZone = (p: Place): "costa" | "valle" | "sierra" => {
    if (
      p.coast_type === "coastal" ||
      p.name.includes("Huanchaco") ||
      p.name.includes("Chicama") ||
      p.name.includes("Malabrigo")
    ) {
      return "costa";
    } else if (p.lat < -7.7 && p.lon > -78.5) {
      return "sierra";
    }
    return "valle";
  };

  // Comprehensive Filtered Places List
  const filteredPlacesList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return initialPlaces
      .filter((p) => {
        // Category match
        if (listCategory !== "all" && p.kind !== listCategory) return false;
        // Zone match
        if (listZone !== "all" && getPlaceZone(p) !== listZone) return false;
        // Search match
        if (q) {
          const nameMatch = p.name.toLowerCase().includes(q);
          const addrMatch = p.address ? p.address.toLowerCase().includes(q) : false;
          const cuisineMatch = p.cuisine ? p.cuisine.toLowerCase().includes(q) : false;
          if (!nameMatch && !addrMatch && !cuisineMatch) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // First priority: places with real addresses and review counts (popular & verified first)
        const aReviews = a.user_rating_count || 0;
        const bReviews = b.user_rating_count || 0;
        if (aReviews !== bReviews) return bReviews - aReviews;

        const aStars = a.stars || 0;
        const bStars = b.stars || 0;
        if (aStars !== bStars) return bStars - aStars;

        return (b.score || 0) - (a.score || 0);
      });
  }, [initialPlaces, listCategory, listZone, searchQuery]);

  const categoryCounts = useMemo(
    () => ({
      all: initialPlaces.length,
      attraction: initialPlaces.filter((place) => place.kind === "attraction").length,
      lodging: initialPlaces.filter((place) => place.kind === "lodging").length,
      food: initialPlaces.filter((place) => place.kind === "food").length,
      activity: initialPlaces.filter((place) => place.kind === "activity").length,
    }),
    [initialPlaces]
  );

  // Public transit calculations for the active day
  const dayTransitSteps = useMemo(() => {
    if (!activeDay || activeDay.places.length < 2) return [];
    const steps: { from: Place; to: Place; transit: TransitOption }[] = [];
    for (let i = 0; i < activeDay.places.length - 1; i++) {
      const from = activeDay.places[i];
      const to = activeDay.places[i + 1];
      steps.push({
        from,
        to,
        transit: getSelectedTransit(from, to),
      });
    }
    return steps;
  }, [activeDay, getSelectedTransit]);

  const handleMapLegSelect = (legId: string) => {
    setSelectedLegId(legId);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileTab("itinerary");
    }
    window.setTimeout(() => {
      document.getElementById(`transit-leg-${legId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  const handleMapPlaceSelect = (place: Place) => {
    setSelectedTransitRoute(null);
    setSelectedMapPlace(place);
    setSelectedMapPlaceDetail(null);
    setIsSelectedMapPlaceExpanded(true);
    setSelectedMapPlaceDetailStatus("loading");
  };

  const handleMapTransitSelect = (segment: MapRouteSegment) => {
    setSelectedTransitRoute(segment);
    setTransitImageFailed(false);
    setSelectedLegId(segment.legId ?? null);
    setSelectedMapPlace(null);
    setSelectedMapPlaceDetail(null);
    setIsSelectedMapPlaceExpanded(false);
    setSelectedMapPlaceDetailStatus("idle");
  };

  useEffect(() => {
    if (!selectedMapPlace) return;

    let isCurrent = true;
    fetchPlaceById(selectedMapPlace.id)
      .then((placeDetail) => {
        if (!isCurrent) return;
        if (!placeDetail) {
          setSelectedMapPlaceDetailStatus("error");
          return;
        }
        setSelectedMapPlaceDetail(placeDetail);
        setSelectedMapPlaceDetailStatus("loaded");
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        console.error(
          `No se pudo cargar la ficha completa del lugar ${selectedMapPlace.id}:`,
          error
        );
        setSelectedMapPlaceDetailStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedMapPlace]);

  // Live budget calculated strictly from the transit fares
  const totalTransitFareRange = useMemo(() => {
    return dayTransitSteps.reduce(
      ([minimum, maximum], step) => [
        minimum + (step.transit.fareRangePen?.[0] ?? step.transit.farePen),
        maximum + (step.transit.fareRangePen?.[1] ?? step.transit.farePen),
      ],
      [0, 0]
    );
  }, [dayTransitSteps]);
  const estimatedTransitMinutes = useMemo(
    () =>
      dayTransitSteps.reduce(
        (total, step) =>
          total +
          (step.transit.vehicleType === "caminata"
            ? 0
            : step.transit.estimatedMinutes + step.transit.waitMinutes),
        0
      ),
    [dayTransitSteps]
  );
  const estimatedWalkingMinutes = useMemo(
    () =>
      routeSegments
        .filter((segment) => segment.legId && segment.kind === "walking")
        .reduce((total, segment) => total + (segment.estimatedMinutes ?? 0), 0),
    [routeSegments]
  );
  const longDistanceSteps = useMemo(
    () =>
      dayTransitSteps.filter(
        (step) =>
          step.transit.estimatedMinutes >= 90 ||
          haversineKm(
            step.from.lat,
            step.from.lon,
            step.to.lat,
            step.to.lon
          ) >= 35
      ),
    [dayTransitSteps]
  );
  const activeDayNumber = activeDay
    ? trip.days.findIndex((day) => day.id === activeDay.id) + 1
    : 1;
  const activeDayLabel = `Día ${activeDayNumber}`;
  const hasTripDates =
    Boolean(trip.startDate && trip.endDate) &&
    Number.isFinite(Date.parse(`${trip.startDate}T00:00:00`)) &&
    Number.isFinite(Date.parse(`${trip.endDate}T00:00:00`)) &&
    Date.parse(`${trip.endDate}T00:00:00`) >=
      Date.parse(`${trip.startDate}T00:00:00`);
  const hasDayPlaces = (activeDay?.places.length ?? 0) > 0;
  const hasDayRoute = dayTransitSteps.length > 0;
  const currentPlannerStep = !hasTripDates ? 1 : hasDayRoute ? 3 : 2;
  const selectedForecastDate = trip.isStarted
    ? activeDay?.date || trip.startDate
    : initialDate;
  const selectedNewDayDate = additionalDayDates.includes(newDayDate)
    ? newDayDate
    : additionalDayDates[0] || "";

  // Handle starting planner from welcome screen
  const handleStartPlanning = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const destination = destInput.trim() || "Trujillo";
    const enteredTitle = newTripTitleInput.trim();
    const defaultTitle = `Viaje a ${trip.destination || "Trujillo"}`;
    renameTrip(
      trip.id,
      !enteredTitle || enteredTitle === defaultTitle
        ? `Viaje a ${destination}`
        : enteredTitle
    );
    setTripDetails({
      destination,
      startDate: startDateInput.trim() || defaultStart,
      endDate: endDateInput.trim() || defaultEnd,
    });
    setIsStarted(true);
  };

  // Center place for Leaflet Map
  const mapCenterPlace: PlaceDetail = useMemo(() => {
    if (activeDay?.places.length) {
      const p = activeDay.places[0];
      return {
        ...p,
        description: p.name,
      } as unknown as PlaceDetail;
    }
    return {
      id: 1,
      name: destInput || "Trujillo, La Libertad",
      lat: -8.1116,
      lon: -79.0287,
      category: "Centro Histórico",
      kind: "attraction",
      coast_type: "inland",
      address: "Trujillo, La Libertad, Perú",
    } as unknown as PlaceDetail;
  }, [activeDay?.places, destInput]);

  const selectedMapPlaceInfo: PlaceDetail | null = selectedMapPlace
    ? {
        ...selectedMapPlace,
        ...(selectedMapPlaceDetail?.id === selectedMapPlace.id
          ? selectedMapPlaceDetail
          : {}),
      }
    : null;
  const selectedMapPlaceDescription = [
    selectedMapPlaceInfo?.description,
    selectedMapPlaceInfo
      ? PLACE_IMAGES[selectedMapPlaceInfo.id]?.description
      : undefined,
  ]
    .map((description) => description?.trim())
    .find(
      (description): description is string =>
        Boolean(description) &&
      !/^no hay una descripci[oó]n disponible\b/i.test(description ?? "")
    );
  const recommendationScoreValue = [
    selectedMapPlaceInfo?.recommendation_score,
    selectedMapPlaceInfo?.score,
  ]
    .map(Number)
    .find((score) => Number.isFinite(score) && score > 0) ?? 0;
  const recommendationScore =
    Number.isFinite(recommendationScoreValue) && recommendationScoreValue > 0
      ? Math.round(recommendationScoreValue)
      : null;
  const safetyScoreValue = Number(selectedMapPlaceInfo?.safety_score ?? 0);
  const safetyScore =
    Number.isFinite(safetyScoreValue) && safetyScoreValue > 0
      ? Math.round(safetyScoreValue)
      : null;
  const selectedMapPlaceImage = selectedMapPlaceInfo
    ? getLocalImageUrl(selectedMapPlaceInfo.image_url) ??
      PLACE_IMAGES[selectedMapPlaceInfo.id]?.image
    : null;
  const selectedMapPlaceWebsite = getSafeExternalUrl(
    selectedMapPlaceInfo?.website
  );
  const selectedMapPlaceMapsUrl =
    getSafeExternalUrl(selectedMapPlaceInfo?.maps_url) ??
    (selectedMapPlaceInfo
      ? `https://www.openstreetmap.org/?mlat=${selectedMapPlaceInfo.lat}&mlon=${selectedMapPlaceInfo.lon}`
      : null);
  const selectedMapPlaceMenuUrl = getSafeExternalUrl(
    selectedMapPlaceInfo?.menu_url
  );

  useEffect(() => {
    if (selectedForecastDate === initialDate) return;

    let isCurrent = true;
    fetchPlaces({ date: selectedForecastDate, limit: 500 })
      .then((places) => {
        if (isCurrent) setLoadedForecast({ date: selectedForecastDate, places });
      })
      .catch((error: unknown) => {
        console.error(`No se pudo cargar el pronóstico para ${selectedForecastDate}:`, error);
      });

    return () => {
      isCurrent = false;
    };
  }, [initialDate, initialPlaces, selectedForecastDate]);

  const forecastPlaces =
    selectedForecastDate === initialDate
      ? initialPlaces
      : loadedForecast?.date === selectedForecastDate
        ? loadedForecast.places
        : [];

  // Weather sample for the active itinerary date
  const weatherSample = useMemo(() => {
    const inland = forecastPlaces.find((p) => p.kind === "attraction" && p.temp_max_c != null);
    const coastal = forecastPlaces.find((p) => p.coast_type === "coastal" && p.wave_height_m != null);
    return { inland, coastal };
  }, [forecastPlaces]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-adobe-bg text-adobe-muted text-xs font-mono">
        Cargando planificador de viajes...
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col justify-between antialiased selection:bg-moche-500 selection:text-white bg-adobe-bg text-adobe-dark font-sans ${compactMode ? "travel-mode" : ""}`}>
      {placeToAdd && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">¿Dónde quieres añadirlo?</h2>
                <p className="mt-1 text-xs text-adobe-muted">{placeToAdd.name}</p>
              </div>
              <button type="button" onClick={() => setPlaceToAdd(null)} className="text-xl text-adobe-muted" aria-label="Cerrar">×</button>
            </div>
            <div className="mt-4 space-y-3">
              {savedTrips.map((savedTrip) => (
                <div key={savedTrip.id} className="rounded-xl border border-adobe-border p-3">
                  <p className="text-sm font-bold">{savedTrip.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {savedTrip.days.map((day, index) => (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => {
                          switchTrip(savedTrip.id);
                          setActiveDayId(day.id);
                          addPlaceToDay(day.id, placeToAdd);
                          setPlaceToAdd(null);
                          setIsStarted(true);
                        }}
                        className="rounded-lg bg-moche-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-moche-700"
                      >
                        Añadir al Día {index + 1} ({day.places.length})
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {isDeleteAllConfirmOpen && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/55 p-4" role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-all-trips-title"
            aria-describedby="delete-all-trips-description"
            className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-2xl"
          >
            <h2 id="delete-all-trips-title" className="text-lg font-display font-bold text-adobe-dark">
              ¿Eliminar todos tus viajes?
            </h2>
            <p id="delete-all-trips-description" className="mt-2 text-sm leading-relaxed text-adobe-muted">
              Se eliminarán los {savedTrips.length} viajes guardados, incluidas sus notas, días y paradas.
              Luego podrás crear un viaje nuevo cuando quieras.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => setIsDeleteAllConfirmOpen(false)}
                className="rounded-xl border border-adobe-border bg-white px-4 py-2.5 text-sm font-bold text-adobe-dark hover:bg-adobe-bg"
              >
                Conservar mis viajes
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteAllTrips();
                  setIsDeleteAllConfirmOpen(false);
                  setIsTripsDrawerOpen(false);
                  setRouteStats(null);
                  setRouteSegments([]);
                  setSelectedLegId(null);
                  setPlaceToAdd(null);
                  setSelectedMapPlace(null);
                  setDestInput("Trujillo");
                }}
                className="rounded-xl border border-red-700 bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800"
              >
                Sí, eliminar todos
              </button>
            </div>
          </section>
        </div>
      )}
      <div>
        <Header
          onOpenTrips={() => setIsTripsDrawerOpen(true)}
          showNavigation={trip.isStarted}
          planner={trip.isStarted ? {
            title: trip.title || `Viaje a ${trip.destination || "Trujillo"}`,
            destination: trip.destination,
            dateRange: formatTripDateRange(trip.startDate, trip.endDate),
            ...getTripDuration(trip.startDate, trip.endDate),
            mapVisible: isMapVisible,
          } : undefined}
          onRenameTrip={(title) => renameTrip(trip.id, title)}
          onEditTripDates={() => setIsStarted(false)}
          onToggleMap={() => {
            setIsMapVisible((visible) => !visible);
            if (isMapVisible && mobileTab === "map") setMobileTab("itinerary");
          }}
          onCreateTrip={() => {
            const newId = createNewTrip(
              "Trujillo",
              `Nuevo viaje ${savedTrips.length + 1}`
            );
            switchTrip(newId);
            setIsStarted(false);
          }}
          savedTripsCount={savedTrips.length}
        />

        {/* ------------------------------------------------------------------ */}
        {/* CASE 1: WELCOME SCREEN (Authentic Colors + Working Date Pickers)   */}
        {/* ------------------------------------------------------------------ */}
        {!trip.isStarted ? (
          <section key={trip.id} id="planner-summary" className="welcome-screen flex min-h-[calc(100dvh-56px)] flex-col items-center justify-center px-4 py-10 sm:px-6">
            <div className="w-full max-w-[560px] space-y-6">
              <div className="space-y-2 text-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-orange-800">
                  <Sparkles className="h-3.5 w-3.5 text-orange-600" />
                  Explora La Libertad a tu manera
                </span>
                <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                  Diseña tu viaje ideal
                </h1>
                <p className="mx-auto max-w-md text-sm text-slate-600">
                  Elige tus destinos y fechas. Nosotros te ayudamos a organizar cada día.
                </p>
              </div>

              <form
                onSubmit={handleStartPlanning}
                className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_48px_rgba(15,23,42,0.08)] sm:p-7"
              >
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-800">
                    ¿A dónde quieres ir?
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={destInput}
                      onChange={(e) => setDestInput(e.target.value)}
                      placeholder="Busca una ciudad o destino"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                    />
                    <MapPin className="absolute right-3.5 top-3.5 h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {["Trujillo", "Huanchaco", "Puerto Chicama", "Campiña de Moche"].map(
                      (sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setDestInput(sug)}
                          className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            destInput === sug
                              ? "border-orange-600 bg-orange-600 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-700"
                          }`}
                        >
                          {sug}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-800">
                    ¿Cuándo viajas?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="mb-1 block text-xs font-medium text-slate-500">
                        Llegada
                      </span>
                      <div className="relative">
                        <input
                          type="date"
                          value={startDateInput}
                          min={availableDates[0]}
                          max={availableDates[availableDates.length - 1]}
                          onChange={(e) => setStartDateInput(e.target.value)}
                          className="w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs font-medium text-slate-500">
                        Salida
                      </span>
                      <div className="relative">
                        <input
                          type="date"
                          value={endDateInput}
                          min={startDateInput || availableDates[0]}
                          max={availableDates[availableDates.length - 1]}
                          onChange={(e) => setEndDateInput(e.target.value)}
                          className="w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                        />
                      </div>
                    </div>
                  </div>
                  <span className="block text-[11px] text-slate-500">
                    Fechas dentro del pronóstico disponible ({availableDates[0]} – {availableDates[availableDates.length - 1]}).
                  </span>
                  <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-600">
                    {tripNights} noches · {tripNights + 1} días de viaje
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="trip-name" className="block text-sm font-bold text-slate-800">
                    Nombre del viaje <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <input
                    id="trip-name"
                    type="text"
                    value={newTripTitleInput}
                    onChange={(event) => setNewTripTitleInput(event.target.value)}
                    placeholder={`Viaje a ${destInput || "Trujillo"}`}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                </div>

                <button
                  type="submit"
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-3.5 font-display text-sm font-bold text-white shadow-md shadow-orange-600/20 transition hover:bg-orange-700"
                >
                  <Route className="h-4 w-4" />
                  <span>Crear mi itinerario</span>
                </button>

                {/* Saved Trips Quick Selector in Welcome Screen */}
                {savedTrips.length > 0 && (
                  <div className="pt-3 border-t border-adobe-border/70 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-adobe-dark flex items-center gap-1.5">
                        <FolderKanban className="w-3.5 h-3.5 text-moche-600" />
                        <span>Tus viajes guardados ({savedTrips.length}):</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsTripsDrawerOpen(true)}
                        className="text-[11px] font-bold text-moche-600 hover:underline cursor-pointer"
                      >
                        Ver todos &rarr;
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {savedTrips.slice(0, 4).map((st) => {
                        const totalStops = st.days.reduce((acc, d) => acc + d.places.length, 0);
                        const isCurrent = st.id === trip.id;
                        return (
                          <div
                            key={st.id}
                            onClick={() => {
                              switchTrip(st.id);
                              setIsStarted(true);
                            }}
                            className={`p-2.5 rounded-xl border text-left cursor-pointer transition flex items-center justify-between gap-2 ${
                              isCurrent
                                ? "bg-moche-50 border-moche-300"
                                : "bg-adobe-bg/40 border-adobe-border hover:bg-white hover:border-moche-200"
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-xs text-adobe-dark truncate block">
                                {st.title || `Viaje a ${st.destination}`}
                              </span>
                              <span className="text-[10px] text-adobe-muted block">
                                {totalStops} paradas &bull; {st.days.length} días
                              </span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-moche-600 text-white shrink-0">
                              Abrir
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </form>

              {/* Link to see catalog */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsStarted(true)}
                  className="text-xs font-semibold text-adobe-muted hover:text-moche-600 underline decoration-dotted transition cursor-pointer"
                >
                  O explora directamente el catálogo de {initialPlaces.length} destinos y servicios &rarr;
                </button>
              </div>
            </div>
          </section>
        ) : (
          /* ------------------------------------------------------------------ */
          /* CASE 2: PLANNER DASHBOARD (Moche Colors + Full Places List)        */
          /* ------------------------------------------------------------------ */
          <div className="planner-dashboard">
            <aside className="planner-sidebar" aria-label="Navegación del planificador">
              <span className="planner-sidebar-label">TU VIAJE</span>
              <a href="#planner-summary"><MapPin />Resumen</a>
              <a href="#places-catalog"><Compass />Explorar</a>
              <a href="#planner-notes"><FileText />Notas</a>
              <Link href="/places"><Landmark />Lugares</Link>
              <span className="planner-sidebar-label planner-days-label">ITINERARIO</span>
              {trip.days.map((day, index) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => {
                    setActiveDayId(day.id);
                    document.getElementById("planner-itinerary")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={day.id === activeDay?.id ? "active" : ""}
                >
                  <span className="planner-day-dot">{index + 1}</span>
                  {formatPlannerDate(day.date)}
                </button>
              ))}
            </aside>
            <nav className="planner-mobile-nav" aria-label="Secciones del viaje">
              <a href="#planner-summary">Resumen</a>
              <a href="#planner-itinerary">Itinerario</a>
              <a href="#planner-notes">Notas</a>
              <Link href="/places">Lugares</Link>
            </nav>
            <div className="planner-main">

            {/* Trip planning progress */}
            <ol
              aria-label="Progreso de planificación"
              className="planner-step-progress grid grid-cols-1 gap-2 rounded-2xl border border-adobe-border bg-white p-3 shadow-2xs sm:grid-cols-3 sm:gap-3 sm:p-4"
            >
              {[
                { number: 1, title: "Fechas", done: hasTripDates },
                { number: 2, title: "Lugares", done: hasDayPlaces },
                { number: 3, title: "Ruta", done: hasDayRoute },
              ].map(({ number, title, done }) => {
                const isCurrent = currentPlannerStep === number;
                const stepContent = (
                  <>
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                        done
                          ? "bg-emerald-700 text-white"
                          : isCurrent
                            ? "bg-moche-700 text-white"
                            : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" aria-hidden="true" /> : number}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{title}</span>
                      <span className="block text-[11px] font-medium text-adobe-muted">
                        {done ? "Completado" : isCurrent ? "Paso actual" : "Pendiente"}
                      </span>
                    </span>
                  </>
                );
                const stepClass = `flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition ${
                  isCurrent
                    ? "border-moche-400 bg-moche-50 text-moche-950 ring-1 ring-moche-200"
                    : done
                      ? "border-emerald-200 bg-emerald-50/60 text-adobe-dark"
                      : "border-adobe-border bg-adobe-bg/50 text-adobe-muted"
                }`;

                if (number === 1) {
                  return (
                    <li key={number}>
                      <button
                        type="button"
                        aria-current={isCurrent ? "step" : undefined}
                        onClick={() => setIsStarted(false)}
                        className={`${stepClass} w-full cursor-pointer hover:border-moche-300 hover:bg-moche-50`}
                      >
                        {stepContent}
                      </button>
                    </li>
                  );
                }

                if (number === 2) {
                  return (
                    <li key={number}>
                      <button
                        type="button"
                        aria-current={isCurrent ? "step" : undefined}
                        onClick={() => {
                          setMobileTab("itinerary");
                          window.setTimeout(
                            () =>
                              placesListRef.current?.scrollIntoView({
                                behavior: "smooth",
                              }),
                            0
                          );
                        }}
                        className={`${stepClass} w-full cursor-pointer hover:border-moche-300 hover:bg-moche-50`}
                      >
                        {stepContent}
                      </button>
                    </li>
                  );
                }

                if (number === 3) {
                  return (
                    <li key={number}>
                      <button
                        type="button"
                        aria-current={isCurrent ? "step" : undefined}
                        onClick={() => {
                          setMobileTab("map");
                          document.getElementById("planner-itinerary")?.scrollIntoView({
                            behavior: "smooth",
                          });
                        }}
                        className={`${stepClass} w-full cursor-pointer hover:border-moche-300 hover:bg-moche-50`}
                      >
                        {stepContent}
                      </button>
                    </li>
                  );
                }

                return (
                  <li
                    key={number}
                    aria-current={isCurrent ? "step" : undefined}
                    className={stepClass}
                  >
                    {stepContent}
                  </li>
                );
              })}
            </ol>

            {/* Concise weather snapshot for the active itinerary day */}
            <div
              role="group"
              aria-label={`Clima para ${formatPlannerDate(selectedForecastDate)}`}
              className="bg-white rounded-2xl border border-adobe-border p-3.5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-moche-50 border border-moche-200 text-moche-600 flex items-center justify-center shrink-0">
                  <Sun className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold text-adobe-dark block">
                    Clima · {formatPlannerDate(selectedForecastDate)}
                  </span>
                  <span className="text-[11px] text-adobe-muted">
                    Resumen para planear el día
                  </span>
                </div>
              </div>

              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                {weatherSample.inland?.temp_max_c != null && (
                  <span className="shrink-0 bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-1">
                    <Sun className="w-3 h-3 text-amber-600" />
                    <span>Máx. {weatherSample.inland.temp_max_c.toFixed(1)}°C</span>
                  </span>
                )}
                {weatherSample.coastal?.wave_height_m != null && (
                  <span className="shrink-0 bg-pacific-50 text-pacific-800 border border-pacific-200 px-2.5 py-1.5 rounded-xl font-bold text-[11px] flex items-center gap-1">
                    <Waves className="w-3 h-3 text-pacific-600" />
                    <span>Oleaje costero {weatherSample.coastal.wave_height_m.toFixed(1)} m</span>
                  </span>
                )}
                {weatherSample.inland?.temp_max_c == null &&
                  weatherSample.coastal?.wave_height_m == null && (
                  <span role="status" className="text-[11px] text-adobe-muted">
                    {selectedForecastDate !== initialDate && loadedForecast?.date !== selectedForecastDate
                      ? "Consultando pronóstico…"
                      : "Pronóstico no disponible para esta fecha"}
                  </span>
                  )}
              </div>
            </div>

            {/* Full-width transit budget */}
            <div className="planner-actions-budget grid grid-cols-1">
              <section className="rounded-2xl border border-adobe-border bg-white p-4 shadow-2xs">
                <div className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-adobe-muted">
                      Presupuesto estimado · {activeDayLabel}
                    </span>
                    <div className="mt-0.5 font-display text-2xl font-extrabold leading-tight text-adobe-dark">
                      {totalTransitFareRange[0] === totalTransitFareRange[1]
                        ? `S/ ${totalTransitFareRange[0].toFixed(2)}`
                        : `S/ ${totalTransitFareRange[0].toFixed(2)}–${totalTransitFareRange[1].toFixed(2)}`}
                    </div>
                  </div>

                  <div className="border-t border-adobe-border/70 pt-2 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-adobe-muted">
                      Tiempo estimado
                    </span>
                    <p className="mt-0.5 text-sm font-extrabold text-adobe-dark">
                      ~{routeStats?.min ?? estimatedTransitMinutes + estimatedWalkingMinutes} min
                      <span className="ml-1 font-normal text-adobe-muted">incluye esperas estimadas</span>
                    </p>
                  </div>

                  <div className="border-t border-adobe-border/70 pt-2 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      Recorrido del día
                    </span>
                    <p className="mt-0.5 text-sm font-extrabold text-emerald-800">
                      {dayTransitSteps.length} {dayTransitSteps.length === 1 ? "tramo" : "tramos"}
                      <span className="ml-1 font-normal">calculados</span>
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Section Notas Persistentes */}
            <div id="planner-notes" className="bg-white rounded-2xl border border-adobe-border p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-adobe-dark flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-moche-600" />
                  <span>Notas del Viaje</span>
                </label>
                <span
                  role="status"
                  aria-live="polite"
                  className={`text-[10px] ${
                    notesSaveStatus === "error" ? "text-red-700" : "text-adobe-muted"
                  }`}
                >
                  {notesSaveStatus === "saved"
                    ? "Guardado en este dispositivo"
                    : notesSaveStatus === "error"
                      ? "No se pudo guardar en este dispositivo"
                      : "Se guarda automáticamente al escribir"}
                </span>
              </div>
              <textarea
                value={trip.notes}
                onChange={(e) => {
                  setNotesSaveStatus(setNotes(e.target.value) ? "saved" : "error");
                }}
                placeholder="Agrega reservas, contactos o recordatorios para tu viaje."
                rows={2}
                className="w-full bg-adobe-bg/40 border border-adobe-border rounded-xl p-3 text-xs font-medium text-adobe-dark focus:bg-white focus:ring-2 focus:ring-moche-500 focus:outline-none placeholder:text-adobe-muted resize-none"
              />
            </div>

            {/* Mobile / Tablet View Switcher Tab (Hidden on Desktop) */}
            <div className="lg:hidden flex items-center bg-white p-1 rounded-2xl border border-adobe-border shadow-2xs">
              <button
                type="button"
                onClick={() => setMobileTab("itinerary")}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  mobileTab === "itinerary"
                    ? "bg-moche-600 text-white shadow-2xs"
                    : "text-adobe-muted hover:text-adobe-dark"
                }`}
              >
                <Route className="w-3.5 h-3.5" />
                <span>Itinerario y Paradas ({activeDay?.places.length || 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab("map")}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  mobileTab === "map"
                    ? "bg-moche-600 text-white shadow-2xs"
                    : "text-adobe-muted hover:text-adobe-dark"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Ver Mapa Interactivo</span>
              </button>
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* SPLIT WORKSPACE: Left Column = Itinerary; Right Column = PlaceMap  */}
            {/* ------------------------------------------------------------------ */}
            <div id="planner-itinerary" className="planner-workspace grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (7 cols): Multi-Day Itinerary with OMUS Transit */}
              <div
                className={`planner-itinerary-column lg:col-span-12 space-y-4 ${
                  mobileTab === "map" ? "hidden lg:block" : "block"
                }`}
              >
                {/* Days Tabs Bar */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {trip.days.map((d, index) => {
                    const isActive = d.id === trip.activeDayId;
                    return (
                      <div
                        key={d.id}
                        onClick={() => setActiveDayId(d.id)}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
                          isActive
                            ? "bg-moche-600 text-white border-moche-600 shadow-2xs"
                            : "bg-white text-adobe-muted hover:text-adobe-dark border-adobe-border hover:bg-adobe-bg"
                        }`}
                      >
                        <CalendarIcon className="w-3.5 h-3.5" />
                        <span>Día {index + 1} · {formatPlannerDate(d.date)}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-adobe-bg text-adobe-dark"
                          }`}
                        >
                          {d.places.length}
                        </span>
                        {index >= 5 && (
                          <button
                            type="button"
                            aria-label="Eliminar día"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeDay(d.id);
                            }}
                            className="ml-1 hover:text-red-200"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {additionalDayDates.length > 0 && (
                    <>
                      <select
                        aria-label="Fecha para el nuevo día"
                        value={selectedNewDayDate}
                        onChange={(event) => setNewDayDate(event.target.value)}
                        className="shrink-0 rounded-xl border border-adobe-border bg-white px-2.5 py-2 text-xs font-semibold text-adobe-dark"
                      >
                        {additionalDayDates.map((date) => (
                          <option key={date} value={date}>{date}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => addDay(selectedNewDayDate)}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-dashed border-adobe-border hover:border-moche-500 text-adobe-muted hover:text-moche-600 transition shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Añadir día</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Hotel Anchor Card */}
                {trip.hotelAnchor && (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Hotel className="w-4 h-4 text-indigo-700 shrink-0" />
                      <span className="font-bold text-indigo-950 truncate">
                        Hotel Ancla: {trip.hotelAnchor.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHotelAnchor(null)}
                      className="text-[11px] font-semibold text-indigo-700 hover:text-red-600 underline shrink-0 cursor-pointer"
                    >
                      Quitar
                    </button>
                  </div>
                )}

                {/* Controls Bar: Mode Switcher & 2-Opt Optimizer */}
                <div className="bg-white rounded-2xl border border-adobe-border p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-adobe-bg border border-adobe-border text-xs font-semibold text-adobe-dark">
                    <Navigation className="w-3.5 h-3.5 text-moche-600" />
                    <span>Ruta entre tus paradas</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompactMode((mode) => !mode)}
                    aria-pressed={compactMode}
                    className="rounded-xl border border-adobe-border bg-white px-3 py-1.5 text-xs font-bold text-adobe-dark hover:bg-adobe-bg"
                  >
                    {compactMode ? "Salir de Modo Viaje" : "Modo Viaje"}
                  </button>

                  {routeStats && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-adobe-dark">
                      <Route className="w-3.5 h-3.5 text-teal-600" />
                      <span>{routeStats.km.toFixed(1)} km</span>
                      <span className="text-adobe-border">•</span>
                      <Clock className="w-3.5 h-3.5 text-adobe-muted" />
                      <span>
                        ~{routeStats.min} min de traslado estimados
                      </span>
                    </div>
                  )}

                  {activeDay && activeDay.places.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Deseas vaciar las ${activeDay.places.length} paradas de ${activeDay.title || "este día"}?`
                          )
                        ) {
                          setDayPlaces(activeDay.id, []);
                          setRouteStats(null);
                          setRouteSegments([]);
                          setSelectedLegId(null);
                        }
                      }}
                      title="Eliminar todas las paradas de este día"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Vaciar paradas</span>
                    </button>
                  )}
                  {activeDay && activeDay.places.length > 2 && (
                    <button
                      type="button"
                      disabled={isCalculating}
                      onClick={handleOptimize}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-2xs transition disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {optimizationProgress
                          ? `Consultando rutas ${optimizationProgress.completed}/${optimizationProgress.total}`
                          : isCalculating
                            ? "Calculando..."
                            : "Optimizar Ruta"}
                      </span>
                    </button>
                  )}
                </div>
                {optimizationProgress && (
                  <button
                    type="button"
                    onClick={cancelOptimization}
                    className="mt-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    aria-label="Cancelar optimización de ruta"
                  >
                    Cancelar optimización
                  </button>
                )}
                {optimizationError && activeDay && activeDay.places.length > MAX_OPTIMIZABLE_STOPS && (
                  <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
                    {optimizationError}
                  </p>
                )}
                {activeDay && activeDay.places.length > MAX_OPTIMIZABLE_STOPS && (
                  <p className="mt-2 text-xs text-amber-900">
                    La optimización multimodal está limitada a {MAX_OPTIMIZABLE_STOPS} paradas por día.
                  </p>
                )}
                {longDistanceSteps.length > 0 && (
                    <div className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-3 text-xs leading-relaxed text-orange-950">
                      <p className="font-bold">Excursión larga fuera del área urbana</p>
                      <p className="mt-1">
                        {longDistanceSteps.map(({ from, to, transit }, index) => {
                          const directKm = haversineKm(
                            from.lat,
                            from.lon,
                            to.lat,
                            to.lon
                          );
                          return (
                            <span key={`${from.id}-${to.id}`}>
                              {index > 0 ? " " : ""}
                              {from.name} → {to.name}: aprox. {directKm.toFixed(0)} km en línea directa y ~{transit.estimatedMinutes} min por tramo.
                            </span>
                          );
                        })}
                      </p>
                      <p className="mt-1 font-semibold">
                        Transporte público estimado: ~{estimatedTransitMinutes} min, incluidas esperas medias. Para excursiones fuera de ciudad, confirma horarios y retorno antes de salir.
                      </p>
                    </div>
                )}

                {/* Ordered Stops List with REAL PUBLIC TRANSIT CONNECTIONS */}
                <div className="space-y-2">
                  {activeDay?.places.length === 0 ? (
                    <div className="bg-white rounded-2xl border-2 border-dashed border-adobe-border p-8 text-center space-y-2">
                      <MapPin className="w-8 h-8 text-adobe-muted mx-auto stroke-1" />
                      <p className="text-xs font-bold text-adobe-dark">
                        No hay paradas en {activeDayLabel}
                      </p>
                      <p className="text-[11px] text-adobe-muted max-w-sm mx-auto">
                        Agrega destinos, restaurantes o tu hotel desde la lista de abajo para armar la ruta diaria.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeDay?.places.map((place, idx) => {
                        const nextPlace = activeDay.places[idx + 1];
                        const pairKey = nextPlace
                          ? getTransitPairKey(place, nextPlace)
                          : "";
                        const baseTransit = nextPlace
                          ? resolvedTransitOptions[pairKey] ??
                            getTransitBetweenPlaces(place, nextPlace, urbanFare)
                          : null;
                        const transit = nextPlace
                          ? getSelectedTransit(place, nextPlace)
                          : null;
                        const alternatives =
                          nextPlace && baseTransit
                            ? getTransitAlternatives(place, nextPlace, baseTransit)
                            : [];
                        const legId = getLegId(idx);
                        const legSegments = routeSegments.filter(
                          (segment) => segment.legId === legId
                        );
                        const boardingWalkKm = transit
                          ? haversineKm(
                              place.lat,
                              place.lon,
                              transit.boardingPoint[0],
                              transit.boardingPoint[1]
                            )
                          : 0;
                        const alightingWalkKm = transit && nextPlace
                          ? haversineKm(
                              transit.dropoffPoint[0],
                              transit.dropoffPoint[1],
                              nextPlace.lat,
                              nextPlace.lon
                            )
                          : 0;
                        const walkMeasure = (
                          phase: "to-board" | "transfer" | "to-place",
                          from: [number, number],
                          to: [number, number],
                          phaseIndex = 0
                        ) => {
                          const phaseSegments = legSegments.filter(
                            (item) => item.kind === "walking" && item.walkPhase === phase
                          );
                          const segment = phaseSegments[phaseIndex];
                          const distanceKm =
                            segment?.distanceKm ??
                            haversineKm(from[0], from[1], to[0], to[1]);
                          const minutes =
                            segment?.estimatedMinutes ??
                            Math.max(1, Math.round((distanceKm / 4.5) * 60));
                          return `~${Math.round(distanceKm * 1000)} m · ~${minutes} min${
                            segment?.isApproximate || !segment
                              ? " (aprox.)"
                              : ""
                          }`;
                        };
                        const totalTravelMinutes = Math.max(
                          1,
                          Math.round(
                            legSegments.reduce(
                              (total, segment) =>
                                total +
                                (segment.estimatedMinutes ?? 0) +
                                (segment.waitMinutes ?? 0),
                              0
                            ) || (transit?.estimatedMinutes ?? 0) + (transit?.waitMinutes ?? 0)
                          )
                        );

                        const imgFallback =
                          place.kind === "food"
                            ? "/images/defaults/default_food.webp"
                            : place.kind === "lodging"
                            ? "/images/defaults/default_lodging.webp"
                            : place.kind === "activity"
                            ? "/images/defaults/default_activity.webp"
                            : "/images/defaults/default_attraction.webp";

                        return (
                          <React.Fragment key={place.id}>
                            {/* Stop Card */}
                            <div
                              draggable
                              onDragStart={() => setDraggedIdx(idx)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                if (
                                  draggedIdx !== null &&
                                  draggedIdx !== idx &&
                                  activeDay
                                ) {
                                  reorderPlaces(activeDay.id, draggedIdx, idx);
                                  setDraggedIdx(null);
                                }
                              }}
                              className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                                draggedIdx === idx
                                  ? "opacity-40 border-dashed border-moche-500 bg-moche-50"
                                  : "bg-white border-adobe-border hover:border-adobe-dark/30 shadow-2xs"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="cursor-grab text-adobe-muted hover:text-adobe-dark">
                                  <GripVertical className="w-4 h-4" />
                                </span>
                                <div className="w-6 h-6 rounded-full bg-moche-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                                  {idx + 1}
                                </div>
                                <img
                                  src={
                                    place.image_url ||
                                    `/images/places/place_${place.id}.webp`
                                  }
                                  alt={place.name}
                                  className="w-10 h-10 rounded-lg object-cover bg-neutral-200 shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = imgFallback;
                                  }}
                                />
                                <div className="min-w-0">
                                  <Link
                                    href={`/places/${place.id}`}
                                    className="font-bold text-xs text-adobe-dark truncate hover:text-moche-600 block"
                                  >
                                    {place.name}
                                  </Link>
                                  <div className="text-[11px] text-adobe-muted flex items-center gap-1.5 mt-0.5">
                                    <span className="capitalize">{place.kind}</span>
                                    <span>•</span>
                                    <span className="truncate">
                                      {place.address || "La Libertad"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                aria-label={`Quitar ${place.name}`}
                                onClick={() =>
                                  removePlaceFromDay(activeDay.id, place.id)
                                }
                                className="p-1.5 text-adobe-muted hover:text-red-600 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Public Transit OMUS Card between stops */}
                            {transit && (
                              <article
                                id={`transit-leg-${legId}`}
                                onClick={() => setSelectedLegId(legId)}
                                onMouseEnter={() => setSelectedLegId(legId)}
                                onFocusCapture={() => setSelectedLegId(legId)}
                                className={`mx-3 my-1.5 p-3 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs shadow-2xs transition ${
                                  selectedLegId === legId
                                    ? "bg-amber-100 border-amber-400 ring-2 ring-amber-200"
                                    : "bg-amber-50/90 border-amber-200/90"
                                }`}
                              >
                                <div className="flex w-full min-w-0 items-center gap-2.5">
                                  <div className="w-9 h-9 rounded-xl bg-amber-800 text-white flex items-center justify-center shrink-0 font-bold text-lg shadow-2xs">
                                    {transit.vehicleType === "caminata"
                                      ? "🚶"
                                      : transit.vehicleType === "taxi"
                                      ? "🚕"
                                      : transit.vehicleType === "combi"
                                      ? "🚐"
                                      : transit.vehicleType === "mototaxi"
                                      ? "🛺"
                                      : "🚌"}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="rounded-full bg-amber-900/10 px-2 py-1 text-[10px] font-bold text-amber-950">
                                        Leg {legId}
                                      </span>
                                      <span className="font-bold text-amber-950 text-sm">
                                        {transit.vehicleType === "micro" ? "Microbús" : transit.vehicleType === "combi" ? "Combi" : transit.vehicleType === "bus" ? "Bus" : transit.vehicleType === "mototaxi" ? "Mototaxi" : transit.vehicleType === "taxi" ? "Taxi / Aplicativo" : "Caminata"}
                                      </span>
                                      {transit.vehicleType === "taxi" ? (
                                        <span className="rounded-full bg-amber-900/10 px-2 py-1 text-[10px] font-bold text-amber-950">
                                          Servicio directo
                                        </span>
                                      ) : transit.vehicleType !== "caminata" && <span
                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold"
                                        style={{
                                          backgroundColor: transit.badgeColor ?? "#92400E",
                                          color: transit.textColor ?? "#FFFFFF",
                                        }}
                                        title={transit.companyName ?? transit.serviceName}
                                      >
                                        {transit.routeCode ?? transit.code}
                                        <span className="font-semibold">
                                          {transit.companyName ?? transit.serviceName}
                                        </span>
                                      </span>
                                      }
                                    </div>
                                    <div className="mt-1.5 space-y-1 text-[12px] leading-snug text-amber-950">
                                      {transit.vehicleType === "caminata" ? (
                                        <p>
                                          <b>Camina:</b> {place.name} → {nextPlace?.name}; {walkMeasure("to-place", [place.lat, place.lon], [nextPlace?.lat ?? place.lat, nextPlace?.lon ?? place.lon])}.
                                        </p>
                                      ) : transit.vehicleType === "taxi" ? (
                                        <>
                                          <p>
                                            <b>Aborda:</b> Taxi en {place.name} (en puerta, paradero de taxis o solicita por app Yango / Uber / inDrive).
                                          </p>
                                          <p>
                                            <b>Trayecto directo:</b> {place.name} → {nextPlace?.name} (sin transbordos ni caminata a paraderos).
                                          </p>
                                          <p>
                                            <b>Tarifa estimada:</b>{" "}
                                            {transit.fareRangePen
                                              ? `S/ ${transit.fareRangePen[0].toFixed(2)} – ${transit.fareRangePen[1].toFixed(2)}`
                                              : `Aprox. S/ ${transit.farePen.toFixed(2)}`}{" "}
                                            · viaje directo ~{transit.estimatedMinutes} min.
                                          </p>
                                        </>
                                      ) : (
                                        <>
                                          <ol className="list-decimal space-y-1 pl-5">
                                          {boardingWalkKm >= 0.05 && (
                                            <li>
                                              <b>Camina:</b>{" "}
                                              {walkMeasure("to-board", [place.lat, place.lon], transit.boardingPoint)} hasta <b>{transit.boardingStop}</b>
                                              {getUsefulLandmarkHint(transit.boardingStop, transit.boardingLandmarkHint) && ` · ${getUsefulLandmarkHint(transit.boardingStop, transit.boardingLandmarkHint)}`}.
                                            </li>
                                          )}
                                          {transit.routeLegs?.length ? (
                                            transit.routeLegs.map((routeLeg, routeLegIndex) => {
                                              const nextRouteLeg = transit.routeLegs?.[routeLegIndex + 1];
                                              return (
                                                <React.Fragment key={`${routeLeg.code}-${routeLegIndex}`}>
                                                  <li>
                                                    <b>{routeLegIndex === 0 ? "Sube" : "Cambia de micro"}:</b>{" "}
                                                    {routeLeg.vehicleType === "mototaxi" ? "mototaxi" : routeLeg.vehicleType === "colectivo" ? "colectivo" : "microbús"} <b>{routeLeg.routeCode ?? routeLeg.code}</b> · {routeLeg.companyName ?? routeLeg.serviceName} en <b>{routeLeg.boardingStop}</b>
                                                    {getUsefulLandmarkHint(routeLeg.boardingStop, routeLeg.boardingLandmarkHint) && ` · ${getUsefulLandmarkHint(routeLeg.boardingStop, routeLeg.boardingLandmarkHint)}`}; espera media ~{routeLeg.waitMinutes} min.
                                                  </li>
                                                  <li>
                                                    <b>Baja:</b> en <b>{routeLeg.dropoffStop}</b>
                                                    {getUsefulLandmarkHint(routeLeg.dropoffStop, routeLeg.dropoffLandmarkHint) && ` · ${getUsefulLandmarkHint(routeLeg.dropoffStop, routeLeg.dropoffLandmarkHint)}`} tras ~{routeLeg.estimatedMinutes} min.
                                                  </li>
                                                  {nextRouteLeg && (
                                                    <li>
                                                      <b>Camina al transbordo:</b>{" "}
                                                      {walkMeasure(
                                                        "transfer",
                                                        routeLeg.dropoffPoint,
                                                        nextRouteLeg.boardingPoint,
                                                        routeLegIndex - 1
                                                      )}{" "}
                                                      hasta {nextRouteLeg.boardingStop}.
                                                    </li>
                                                  )}
                                                </React.Fragment>
                                              );
                                            })
                                          ) : (
                                            <>
                                              <li>
                                                <b>Sube:</b> {transit.vehicleType === "combi" ? "combi" : transit.vehicleType === "colectivo" ? "colectivo" : "microbús"} <b>{transit.routeCode ?? transit.code}</b> · {transit.companyName ?? transit.serviceName} en <b>{transit.boardingStop}</b>
                                                {getUsefulLandmarkHint(transit.boardingStop, transit.boardingLandmarkHint) && ` · ${getUsefulLandmarkHint(transit.boardingStop, transit.boardingLandmarkHint)}`}
                                                {transit.headsign && !/no verificado|referencial/i.test(transit.headsign) && <>; busca el letrero <b>{transit.headsign}</b></>}
                                                {transit.waitMinutes > 0 && `; espera media ~${transit.waitMinutes} min.`}
                                              </li>
                                              <li>
                                                <b>Baja:</b>{" "}
                                                en <b>{transit.dropoffStop}</b>
                                                {getUsefulLandmarkHint(transit.dropoffStop, transit.dropoffLandmarkHint) && ` · ${getUsefulLandmarkHint(transit.dropoffStop, transit.dropoffLandmarkHint)}`}
                                                {` tras ~${transit.estimatedMinutes} min de viaje.`}
                                              </li>
                                            </>
                                          )}
                                          {alightingWalkKm >= 0.05 && <li>
                                            <b>Camina:</b> {walkMeasure("to-place", transit.dropoffPoint, [nextPlace?.lat ?? place.lat, nextPlace?.lon ?? place.lon])} hasta <b>{nextPlace?.name ?? "tu destino"}</b>.
                                          </li>}
                                          </ol>
                                        </>
                                      )}
                                    </div>
                                    {transit.vehicleType === "taxi" && transit.warning && (
                                      <p className="mt-1.5 text-[10px] text-amber-800/80">
                                        {transit.warning}
                                      </p>
                                    )}
                                    {alternatives.length > 1 && (
                                      <div
                                        className="mt-2 flex flex-wrap gap-1.5"
                                        role="group"
                                        aria-label={`Alternativas para ir de ${place.name} a ${nextPlace?.name}`}
                                      >
                                        {alternatives.map((alternative) => {
                                          const isSelected =
                                            (selectedTransitModes[pairKey] ?? "transit") ===
                                            alternative.id;
                                          const totalMinutes =
                                            alternative.transit.estimatedMinutes +
                                            alternative.transit.waitMinutes;
                                          return (
                                            <button
                                              key={alternative.id}
                                              type="button"
                                              aria-pressed={isSelected}
                                              onClick={() =>
                                                setSelectedTransitModes((current) => ({
                                                  ...current,
                                                  [pairKey]: alternative.id,
                                                }))
                                              }
                                              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${
                                                isSelected
                                                  ? "border-amber-900 bg-amber-900 text-white"
                                                  : "border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                                              }`}
                                            >
                                              {alternative.label} · ~{totalMinutes} min ·{" "}
                                              {alternative.transit.fareRangePen
                                                ? `S/ ${alternative.transit.fareRangePen[0].toFixed(2)}–${alternative.transit.fareRangePen[1].toFixed(2)}`
                                                : `S/ ${alternative.transit.farePen.toFixed(2)}`}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      aria-pressed={selectedLegId === legId}
                                      onClick={() => {
                                        setSelectedLegId(legId);
                                        setMobileTab("map");
                                        document.getElementById("planner-map")?.scrollIntoView({
                                          behavior: "smooth",
                                          block: "center",
                                        });
                                      }}
                                      className="mt-2 rounded-lg border border-amber-800 px-2.5 py-1.5 text-[11px] font-bold text-amber-950 hover:bg-amber-200"
                                    >
                                      Ver tramo en el mapa
                                    </button>
                                  </div>
                                </div>

                                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-1 border-t sm:border-t-0 pt-1.5 sm:pt-0 border-amber-200/70 shrink-0">
                                  <span className="text-sm font-extrabold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-md">
                                    {transit.farePen === 0
                                      ? "Gratis"
                                      : transit.fareRangePen
                                        ? `S/ ${transit.fareRangePen[0].toFixed(2)}–${transit.fareRangePen[1].toFixed(2)}`
                                        : `Aprox. S/ ${transit.farePen.toFixed(2)}`}
                                  </span>
                                  <span className="text-[11px] font-bold text-neutral-700">
                                    {transit.vehicleType === "caminata"
                                      ? walkMeasure("to-place", [place.lat, place.lon], [nextPlace?.lat ?? place.lat, nextPlace?.lon ?? place.lon])
                                      : `~${totalTravelMinutes} min total`}
                                  </span>
                                </div>
                              </article>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column (5 cols): Territorial Interactive Leaflet Map */}
              {isMapVisible && <div
                className={`planner-map-column lg:col-span-5 ${
                  mobileTab === "itinerary" ? "hidden lg:block" : "block"
                }`}
              >
                <div className="planner-map-sticky space-y-3">
                  <div className="bg-white rounded-3xl border border-adobe-border p-3 shadow-md overflow-hidden">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-xs font-bold text-adobe-dark flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-moche-600" />
                        <span>Mapa de tu día</span>
                      </span>
                      <span className="text-[10px] text-adobe-muted">
                        Mapa base OSM
                      </span>
                    </div>

                    <div
                      id="planner-map"
                      className={`planner-map-layout ${
                        selectedMapPlaceInfo || selectedTransitRoute
                          ? "has-place-detail"
                          : ""
                      }`}
                    >
                      <PlaceMap
                        place={mapCenterPlace}
                        routeSegments={routeSegments}
                        routePlaces={activeDay?.places ?? EMPTY_ROUTE_PLACES}
                        catalogPlaces={initialPlaces}
                        catalogKind={listCategory}
                        selectedPlace={selectedMapPlace}
                        hotelAnchor={trip.hotelAnchor}
                        selectedLegId={selectedLegId}
                        onSelectLeg={handleMapLegSelect}
                        onSelectTransitRoute={handleMapTransitSelect}
                        onSelectPlace={handleMapPlaceSelect}
                        simplified={compactMode}
                      />
                      {selectedMapPlaceInfo && (
                        <section
                          id="map-place-menu"
                          aria-label="Información del lugar seleccionado en el mapa"
                          aria-live="polite"
                          className="planner-map-place-detail flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-adobe-border bg-white shadow-sm"
                        >
                      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-adobe-border p-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          {selectedMapPlaceImage && (
                            <img
                              src={selectedMapPlaceImage}
                              alt=""
                              loading="lazy"
                              className="h-14 w-14 shrink-0 rounded-lg bg-adobe-bg object-cover"
                            />
                          )}
                          <div className="min-w-0">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-moche-700">
                              {selectedMapPlaceInfo.kind === "attraction"
                                ? "Atractivo"
                                : selectedMapPlaceInfo.kind === "food"
                                  ? "Restaurante"
                                  : selectedMapPlaceInfo.kind === "lodging"
                                    ? "Hospedaje"
                                    : "Lugar"}
                              {selectedMapPlaceInfo.coast_type === "coastal" ? " · Costa" : ""}
                            </span>
                            <h3 className="truncate text-sm font-bold text-adobe-dark">
                              {selectedMapPlaceInfo.name}
                            </h3>
                            {selectedMapPlaceInfo.address && (
                              <p className="truncate text-[10px] text-adobe-muted">
                                {selectedMapPlaceInfo.address}
                              </p>
                            )}
                            {(selectedMapPlaceInfo.stars != null ||
                              selectedMapPlaceInfo.external_rating != null) && (
                              <p className="text-[10px] font-semibold text-amber-700">
                                {selectedMapPlaceInfo.stars != null
                                  ? `★ ${selectedMapPlaceInfo.stars.toFixed(1)}`
                                  : selectedMapPlaceInfo.external_rating != null
                                    ? `★ ${selectedMapPlaceInfo.external_rating.toFixed(1)}`
                                    : ""}
                                {selectedMapPlaceInfo.user_rating_count != null
                                  ? ` · ${selectedMapPlaceInfo.user_rating_count} reseñas`
                                  : ""}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="Cerrar información del lugar"
                          onClick={() => {
                            setSelectedMapPlace(null);
                            setSelectedMapPlaceDetail(null);
                            setIsSelectedMapPlaceExpanded(false);
                            setSelectedMapPlaceDetailStatus("idle");
                          }}
                          className="rounded-lg p-1 text-adobe-muted hover:bg-adobe-bg"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {isSelectedMapPlaceExpanded && (
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                        {selectedMapPlaceDescription && (
                          <p className="text-sm leading-relaxed text-adobe-dark">
                            {selectedMapPlaceDescription}
                          </p>
                        )}

                        {selectedMapPlaceDetailStatus === "loading" && (
                          <p role="status" className="text-xs text-adobe-muted">
                            Cargando datos completos del lugar…
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-lg bg-adobe-bg p-2">
                            <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Tipo</span>
                            <span className="mt-0.5 block font-semibold text-adobe-dark">
                              {selectedMapPlaceInfo.kind === "attraction"
                                ? "Atractivo turístico"
                                : selectedMapPlaceInfo.kind === "food"
                                  ? "Restaurante"
                                  : selectedMapPlaceInfo.kind === "lodging"
                                    ? "Hospedaje"
                                    : selectedMapPlaceInfo.kind === "activity"
                                      ? "Actividad"
                                      : "Lugar"}
                              {selectedMapPlaceInfo.coast_type === "coastal"
                                ? " · Costa"
                                : " · Valle/interior"}
                            </span>
                          </div>
                          {(selectedMapPlaceInfo.stars != null ||
                            selectedMapPlaceInfo.external_rating != null) && (
                            <div className="rounded-lg bg-adobe-bg p-2">
                              <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Valoración</span>
                              <span className="mt-0.5 block font-semibold text-adobe-dark">
                                {selectedMapPlaceInfo.stars != null
                                  ? `★ ${selectedMapPlaceInfo.stars.toFixed(1)} / 5`
                                  : selectedMapPlaceInfo.external_rating != null
                                    ? `★ ${selectedMapPlaceInfo.external_rating.toFixed(1)} / 5`
                                    : ""}
                                {selectedMapPlaceInfo.user_rating_count != null
                                  ? ` · ${selectedMapPlaceInfo.user_rating_count} reseñas`
                                  : ""}
                              </span>
                            </div>
                          )}
                          {selectedMapPlaceInfo.cuisine && (
                            <div className="rounded-lg bg-adobe-bg p-2">
                              <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Gastronomía</span>
                              <span className="mt-0.5 block font-semibold text-adobe-dark">{selectedMapPlaceInfo.cuisine}</span>
                            </div>
                          )}
                          {selectedMapPlaceInfo.opening_hours && (
                            <div className="rounded-lg bg-adobe-bg p-2">
                              <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Horario registrado</span>
                              <span className="mt-0.5 block font-semibold text-adobe-dark">{selectedMapPlaceInfo.opening_hours}</span>
                            </div>
                          )}
                          {(selectedMapPlaceInfo.price_min != null || selectedMapPlaceInfo.price_max != null) && (
                            <div className="rounded-lg bg-adobe-bg p-2">
                              <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Precio registrado</span>
                              <span className="mt-0.5 block font-semibold text-adobe-dark">
                                {selectedMapPlaceInfo.price_min != null ? `S/ ${selectedMapPlaceInfo.price_min.toFixed(2)}` : ""}
                                {selectedMapPlaceInfo.price_min != null && selectedMapPlaceInfo.price_max != null ? " – " : ""}
                                {selectedMapPlaceInfo.price_max != null ? `S/ ${selectedMapPlaceInfo.price_max.toFixed(2)}` : ""}
                              </span>
                            </div>
                          )}
                          {recommendationScore != null && (
                            <div className="rounded-lg bg-adobe-bg p-2">
                              <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Puntaje de recomendación</span>
                              <span className="mt-0.5 block font-semibold text-adobe-dark">
                                {recommendationScore} / 100
                              </span>
                            </div>
                          )}
                          {safetyScore != null && (
                            <div className="rounded-lg bg-adobe-bg p-2">
                              <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Índice de seguridad</span>
                              <span className="mt-0.5 block font-semibold text-adobe-dark">{safetyScore} / 100</span>
                            </div>
                          )}
                          <div className="rounded-lg bg-adobe-bg p-2">
                            <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Coordenadas</span>
                            <span className="mt-0.5 block font-mono text-[11px] text-adobe-dark">
                              {selectedMapPlaceInfo.lat.toFixed(5)}, {selectedMapPlaceInfo.lon.toFixed(5)}
                            </span>
                          </div>
                        </div>

                        {selectedMapPlaceInfo.recommendation_summary && (
                          <p className="rounded-lg border border-moche-100 bg-moche-50 p-3 text-xs leading-relaxed text-adobe-dark">
                            {selectedMapPlaceInfo.recommendation_summary}
                          </p>
                        )}

                        {(selectedMapPlaceInfo.phone || selectedMapPlaceWebsite || selectedMapPlaceMapsUrl || selectedMapPlaceMenuUrl) && (
                          <div className="flex flex-wrap gap-2">
                            {selectedMapPlaceInfo.phone && (
                              <a href={`tel:${selectedMapPlaceInfo.phone}`} className="inline-flex items-center gap-1 rounded-lg border border-adobe-border px-2.5 py-1.5 text-xs font-semibold text-adobe-dark hover:bg-adobe-bg">
                                <Phone className="h-3.5 w-3.5" /> {selectedMapPlaceInfo.phone}
                              </a>
                            )}
                            {selectedMapPlaceWebsite && (
                              <a href={selectedMapPlaceWebsite} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-adobe-border px-2.5 py-1.5 text-xs font-semibold text-adobe-dark hover:bg-adobe-bg">
                                <Globe className="h-3.5 w-3.5" /> Sitio web <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {selectedMapPlaceMenuUrl && (
                              <a href={selectedMapPlaceMenuUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-adobe-border px-2.5 py-1.5 text-xs font-semibold text-adobe-dark hover:bg-adobe-bg">
                                <Utensils className="h-3.5 w-3.5" /> Menú <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {selectedMapPlaceMapsUrl && (
                              <a href={selectedMapPlaceMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-adobe-border px-2.5 py-1.5 text-xs font-semibold text-adobe-dark hover:bg-adobe-bg">
                                <MapPin className="h-3.5 w-3.5" /> Ver mapa <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        )}

                        {selectedMapPlaceInfo.offers && selectedMapPlaceInfo.offers.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-xs font-bold text-adobe-dark">Precios y ofertas</h4>
                            <div className="space-y-1.5">
                              {selectedMapPlaceInfo.offers.map((offer, index) => (
                                <div key={`${offer.kind}-${offer.name}-${index}`} className="flex justify-between gap-3 rounded-lg bg-adobe-bg px-3 py-2 text-xs">
                                  <span>{offer.name}</span>
                                  <strong>{offer.currency} {offer.price.toFixed(2)}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedMapPlaceInfo.safety_report && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <h4 className="text-xs font-bold text-emerald-900">
                              Seguridad: {selectedMapPlaceInfo.safety_report.risk_level}
                            </h4>
                            <p className="mt-1 text-xs text-emerald-900">
                              {selectedMapPlaceInfo.safety_report.incident_count} incidentes registrados en un radio de {selectedMapPlaceInfo.safety_report.radius_meters} m.
                            </p>
                            {selectedMapPlaceInfo.safety_report.recommendations.length > 0 && (
                              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-emerald-900">
                                {selectedMapPlaceInfo.safety_report.recommendations.map((recommendation, index) => (
                                  <li key={`${index}-${recommendation}`}>{recommendation}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {selectedMapPlaceInfo.reviews && selectedMapPlaceInfo.reviews.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-xs font-bold text-adobe-dark">Reseñas disponibles</h4>
                            <div className="space-y-2">
                              {selectedMapPlaceInfo.reviews.map((review, index) => (
                                <blockquote key={`${index}-${review.author_name}`} className="rounded-lg bg-adobe-bg p-3 text-xs">
                                  <div className="font-semibold">{review.author_name} · ★ {review.rating}</div>
                                  <p className="mt-1 text-adobe-muted">{review.text}</p>
                                  {review.relative_time && <cite className="mt-1 block not-italic text-[10px] text-adobe-muted">{review.relative_time}</cite>}
                                </blockquote>
                              ))}
                            </div>
                          </div>
                        )}

                        </div>
                      )}
                      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-adobe-border bg-white p-2">
                        <button
                          type="button"
                          aria-expanded={isSelectedMapPlaceExpanded}
                          onClick={() =>
                            setIsSelectedMapPlaceExpanded((expanded) => !expanded)
                          }
                          className="rounded-lg px-2 py-1.5 text-[10px] font-bold text-adobe-dark hover:bg-adobe-bg"
                        >
                          {isSelectedMapPlaceExpanded ? "Menos info" : "Más información"}
                        </button>
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/places/${selectedMapPlaceInfo.id}`}
                            className="rounded-lg border border-adobe-border px-2 py-1.5 text-[10px] font-bold text-adobe-dark hover:bg-adobe-bg"
                          >
                            Ver ficha completa
                          </Link>
                          {activeDay?.places.some(
                            (itineraryPlace) => itineraryPlace.id === selectedMapPlaceInfo.id
                          ) ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1.5 text-[10px] font-bold text-emerald-800">
                              <Check className="h-3 w-3" />
                              En {activeDayLabel}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPlaceToAdd(selectedMapPlaceInfo)}
                              className="inline-flex items-center gap-1 rounded-lg bg-moche-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-moche-700"
                            >
                              <Plus className="h-3 w-3" />
                              Elegir viaje y día
                            </button>
                          )}
                        </div>
                      </div>
                        </section>
                      )}
                      {selectedTransitRoute && (
                        <section
                          id="map-transit-detail"
                          aria-label="Ficha del transporte seleccionado"
                          aria-live="polite"
                          className="planner-map-place-detail flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-adobe-border bg-white shadow-sm"
                        >
                          <div className="relative h-32 shrink-0 overflow-hidden bg-slate-900">
                            {getLocalImageUrl(selectedTransitRoute.vehicleImageUrl) && !transitImageFailed ? (
                              <img
                                src={getLocalImageUrl(selectedTransitRoute.vehicleImageUrl) ?? undefined}
                                alt={`Unidad de ${selectedTransitRoute.companyName ?? selectedTransitRoute.label}`}
                                className="h-full w-full object-cover"
                                onError={() => setTransitImageFailed(true)}
                              />
                            ) : (
                              <div
                                className="flex h-full items-center justify-between gap-3 px-5 text-white"
                                style={{
                                  background: `linear-gradient(125deg, ${selectedTransitRoute.badgeColor ?? selectedTransitRoute.routeColor ?? "#0369A1"}, #0f172a)`,
                                }}
                              >
                                <div className="min-w-0">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/75">
                                    {selectedTransitRoute.vehicleType === "taxi"
                                      ? "Servicio de Taxi / Aplicativo"
                                      : "Transporte Público Urbano de Trujillo"}
                                  </span>
                                  <strong className="mt-1 block truncate text-xl">
                                    {selectedTransitRoute.vehicleType === "taxi"
                                      ? "Taxi directo"
                                      : selectedTransitRoute.routeCode ?? selectedTransitRoute.label.split(":")[0]}
                                  </strong>
                                  <span className="block truncate text-xs text-white/85">
                                    {selectedTransitRoute.vehicleType === "taxi"
                                      ? "Recojo en el punto de partida"
                                      : selectedTransitRoute.companyName ?? "Servicio de transporte"}
                                  </span>
                                </div>
                                {selectedTransitRoute.vehicleType === "taxi" ? (
                                  <CarFront className="h-12 w-12 shrink-0 text-white/90" aria-hidden="true" />
                                ) : (
                                  <BusFront className="h-12 w-12 shrink-0 text-white/90" aria-hidden="true" />
                                )}
                              </div>
                            )}
                            <span
                              className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-extrabold shadow-sm"
                              style={{
                                backgroundColor: selectedTransitRoute.badgeColor ?? selectedTransitRoute.routeColor ?? "#0369A1",
                                color: selectedTransitRoute.textColor ?? "#fff",
                              }}
                            >
                              {selectedTransitRoute.vehicleType === "taxi"
                                ? "Taxi / aplicativo"
                                : selectedTransitRoute.vehicleType === "micro"
                                ? "Microbús"
                                : selectedTransitRoute.vehicleType === "combi"
                                  ? "Combi"
                                  : selectedTransitRoute.vehicleType ?? "Transporte"}
                            </span>
                            <button
                              type="button"
                              aria-label="Cerrar ficha de transporte"
                              onClick={() => {
                                setSelectedTransitRoute(null);
                                setSelectedLegId(null);
                                setTransitImageFailed(false);
                              }}
                              className="absolute right-2 top-2 rounded-full bg-black/45 p-1.5 text-white hover:bg-black/65"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                            <div>
                              <h3 className="text-sm font-bold text-adobe-dark">
                                {selectedTransitRoute.vehicleType === "taxi"
                                  ? "Servicio de Taxi / Aplicativo"
                                  : selectedTransitRoute.companyName ?? selectedTransitRoute.label}
                              </h3>
                              {selectedTransitRoute.vehicleType !== "taxi" && (
                                <p className="text-[11px] text-adobe-muted">
                                  Ruta {selectedTransitRoute.routeCode ?? selectedTransitRoute.label.split(":")[0]}
                                </p>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="rounded-lg bg-adobe-bg p-2">
                                <span className="block text-[10px] font-semibold uppercase text-adobe-muted">
                                  {selectedTransitRoute.vehicleType === "taxi" ? "Tarifa estimada" : "Pasaje"}
                                </span>
                                <strong className="mt-0.5 block text-adobe-dark">
                                  {selectedTransitRoute.vehicleType === "taxi" && selectedTransitRoute.fareRangePen
                                    ? `S/ ${selectedTransitRoute.fareRangePen[0].toFixed(2)}–${selectedTransitRoute.fareRangePen[1].toFixed(2)} · estimado`
                                    : selectedTransitRoute.farePen != null
                                    ? `S/ ${selectedTransitRoute.farePen.toFixed(2)}`
                                    : "No disponible"}
                                </strong>
                              </div>
                              {selectedTransitRoute.vehicleType !== "taxi" && <div className="rounded-lg bg-adobe-bg p-2">
                                <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Espera media</span>
                                <strong className="mt-0.5 block text-adobe-dark">
                                  {selectedTransitRoute.waitMinutes != null
                                    ? `~${selectedTransitRoute.waitMinutes} min`
                                    : "—"}
                                </strong>
                              </div>}
                              <div className="rounded-lg bg-adobe-bg p-2">
                                <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Tiempo de viaje</span>
                                <strong className="mt-0.5 block text-adobe-dark">
                                  {selectedTransitRoute.estimatedMinutes != null
                                    ? `~${selectedTransitRoute.estimatedMinutes} min`
                                    : "—"}
                                </strong>
                              </div>
                              <div className="rounded-lg bg-adobe-bg p-2">
                                <span className="block text-[10px] font-semibold uppercase text-adobe-muted">Distancia a bordo</span>
                                <strong className="mt-0.5 block text-adobe-dark">
                                  {selectedTransitRoute.distanceKm != null
                                    ? `${selectedTransitRoute.distanceKm.toFixed(1)} km`
                                    : "—"}
                                </strong>
                              </div>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div className="rounded-lg border border-adobe-border p-2.5">
                                <span className="block text-[10px] font-bold uppercase text-moche-700">
                                  {selectedTransitRoute.vehicleType === "taxi" ? "Punto de recojo" : "Subes en"}
                                </span>
                                <strong className="mt-0.5 block text-adobe-dark">
                                  {selectedTransitRoute.boardingStop ?? "Paradero sugerido"}
                                </strong>
                                {getUsefulLandmarkHint(selectedTransitRoute.boardingStop ?? "", selectedTransitRoute.boardingLandmarkHint) && (
                                  <span className="mt-0.5 block leading-relaxed text-adobe-muted">
                                    {getUsefulLandmarkHint(selectedTransitRoute.boardingStop ?? "", selectedTransitRoute.boardingLandmarkHint)}
                                  </span>
                                )}
                              </div>
                              <div className="rounded-lg border border-adobe-border p-2.5">
                                <span className="block text-[10px] font-bold uppercase text-moche-700">
                                  {selectedTransitRoute.vehicleType === "taxi" ? "Destino" : "Bajas en"}
                                </span>
                                <strong className="mt-0.5 block text-adobe-dark">
                                  {selectedTransitRoute.dropoffStop ?? "Paradero sugerido"}
                                </strong>
                                {getUsefulLandmarkHint(selectedTransitRoute.dropoffStop ?? "", selectedTransitRoute.dropoffLandmarkHint) && (
                                  <span className="mt-0.5 block leading-relaxed text-adobe-muted">
                                    {getUsefulLandmarkHint(selectedTransitRoute.dropoffStop ?? "", selectedTransitRoute.dropoffLandmarkHint)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </section>
                      )}
                    </div>

                    <p className="mt-2 px-1 text-[11px] text-adobe-muted">
                      Los números indican destinos; selecciona una línea o marcador para ver los detalles del tramo.
                    </p>
                  </div>
                </div>
              </div>}
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* COMPREHENSIVE PLACES LIST (Addressing user request)               */}
            {/* ------------------------------------------------------------------ */}
            <div
              id="places-catalog"
              ref={placesListRef}
              className="bg-white rounded-3xl border border-adobe-border p-5 sm:p-6 shadow-sm space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-adobe-border/70 pb-4">
                <div>
                  <h2 className="text-lg font-display font-bold text-adobe-dark flex items-center gap-2">
                    <Landmark className="w-5 h-5 text-moche-600" />
                    <span>Catálogo de Lugares para Visitar ({filteredPlacesList.length})</span>
                  </h2>
                  <p className="text-xs text-adobe-muted">
                    Explora y añade directamente atractivos, restaurantes u hospedajes al {activeDayLabel}.
                  </p>
                </div>

                {/* Zone Filter Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-adobe-muted font-semibold">Zona:</span>
                  <select
                    value={listZone}
                    onChange={(e) => setListZone(e.target.value as "all" | "costa" | "valle" | "sierra")}
                    className="bg-adobe-bg border border-adobe-border rounded-xl px-2.5 py-1.5 text-xs font-semibold text-adobe-dark focus:ring-2 focus:ring-moche-500 focus:outline-none cursor-pointer"
                  >
                    <option value="all">Toda la Región</option>
                    <option value="costa">Balnearios (Huanchaco, Chicama)</option>
                    <option value="valle">Valle Moche (Chan Chan, Moche)</option>
                    <option value="sierra">Sierra (Otuzco, Huamachuco)</option>
                  </select>
                </div>
                </div>
              </div>

              {/* Category Filter Tabs */}
              <div className="planner-category-tabs flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setListCategory("all")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
                    listCategory === "all"
                      ? "bg-moche-600 text-white border-moche-600 shadow-2xs"
                      : "bg-adobe-bg text-adobe-muted hover:text-adobe-dark border-adobe-border"
                  }`}
                >
                  Todos ({categoryCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setListCategory("attraction")}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
                    listCategory === "attraction"
                      ? "bg-moche-600 text-white border-moche-600 shadow-2xs"
                      : "bg-adobe-bg text-adobe-muted hover:text-adobe-dark border-adobe-border"
                  }`}
                >
                  <Landmark className="w-3.5 h-3.5" />
                  <span>Atractivos ({categoryCounts.attraction})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setListCategory("lodging")}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
                    listCategory === "lodging"
                      ? "bg-moche-600 text-white border-moche-600 shadow-2xs"
                      : "bg-adobe-bg text-adobe-muted hover:text-adobe-dark border-adobe-border"
                  }`}
                >
                  <Hotel className="w-3.5 h-3.5" />
                  <span>Hospedajes ({categoryCounts.lodging})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setListCategory("food")}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
                    listCategory === "food"
                      ? "bg-moche-600 text-white border-moche-600 shadow-2xs"
                      : "bg-adobe-bg text-adobe-muted hover:text-adobe-dark border-adobe-border"
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5" />
                  <span>Restaurantes ({categoryCounts.food})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setListCategory("activity")}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
                    listCategory === "activity"
                      ? "bg-moche-600 text-white border-moche-600 shadow-2xs"
                      : "bg-adobe-bg text-adobe-muted hover:text-adobe-dark border-adobe-border"
                  }`}
                >
                  <ActivityIcon className="w-3.5 h-3.5" />
                  <span>Actividades ({categoryCounts.activity})</span>
                </button>
              </div>

              {/* Search input with clear button */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, calle, gastronomía o distrito (ej. Big Ben, Chan Chan, Huanchaco)..."
                  className="w-full bg-adobe-bg/50 border border-adobe-border rounded-xl pl-9 pr-8 py-2.5 text-xs font-semibold text-adobe-dark focus:bg-white focus:ring-2 focus:ring-moche-500 focus:outline-none placeholder:text-adobe-muted"
                />
                <Search className="w-4 h-4 text-adobe-muted absolute left-3 top-3" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-2.5 text-adobe-muted hover:text-adobe-dark text-xs font-bold"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* VERTICAL STRUCTURED LIST */}
              <div className="space-y-3">
                {filteredPlacesList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-adobe-muted bg-adobe-bg/50 rounded-2xl border border-adobe-border">
                    No se encontraron lugares con los filtros seleccionados.
                  </div>
                ) : (
                  filteredPlacesList.slice(0, displayCount).map((item) => {
                    const isAlreadyInActiveDay = activeDay?.places.some(
                      (p) => p.id === item.id
                    );
                    const isHotelAnchor = trip.hotelAnchor?.id === item.id;

                    const imgFallback =
                      item.kind === "food"
                        ? "/images/defaults/default_food.webp"
                        : item.kind === "lodging"
                        ? "/images/defaults/default_lodging.webp"
                        : item.kind === "activity"
                        ? "/images/defaults/default_activity.webp"
                        : "/images/defaults/default_attraction.webp";

                    const imageSrc =
                      item.image_url && !item.image_url.includes("google")
                        ? item.image_url
                        : `/images/places/place_${item.id}.webp`;

                    return (
                      <div
                        key={item.id}
                        className="bg-white border border-adobe-border rounded-2xl p-3.5 sm:p-4 hover:border-moche-300 hover:shadow-2xs transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                      >
                        {/* Left: Thumbnail & Details */}
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                          <img
                            src={imageSrc}
                            alt={item.name}
                            className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl object-cover bg-neutral-100 shrink-0 border border-adobe-border/60"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = imgFallback;
                            }}
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-adobe-dark hover:text-moche-600 transition">
                                <Link href={`/places/${item.id}`}>{item.name}</Link>
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                  item.kind === "attraction"
                                    ? "bg-moche-50 text-moche-700 border border-moche-200"
                                    : item.kind === "food"
                                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                                    : item.kind === "lodging"
                                    ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                                    : "bg-teal-50 text-teal-800 border border-teal-200"
                                }`}
                              >
                                {item.kind === "attraction"
                                  ? "Atractivo"
                                  : item.kind === "food"
                                  ? "Gastronomía"
                                  : item.kind === "lodging"
                                  ? "Hospedaje"
                                  : "Actividad"}
                              </span>
                            </div>

                            <p className="text-[11px] text-adobe-muted line-clamp-1">
                              {item.address || "La Libertad, Perú"}
                              {item.cuisine ? ` • Cocina ${item.cuisine}` : ""}
                            </p>

                            <div className="flex items-center gap-2.5 text-[11px] text-adobe-muted flex-wrap">
                              {item.stars != null ? (
                                <span className="font-semibold text-amber-700">
                                  ★ {item.stars.toFixed(1)}
                                  {item.user_rating_count
                                    ? ` (${item.user_rating_count})`
                                    : ""}
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-semibold">
                                  ✓ Verificado
                                </span>
                              )}

                              {item.phone && (
                                <span className="hidden sm:inline text-neutral-500">
                                  &bull; Tel: {item.phone}
                                </span>
                              )}

                              {item.safety_score != null && (
                                <span className="text-[10px] bg-emerald-50 text-emerald-800 px-1.5 py-0.2 rounded font-medium">
                                  Seguridad: {Math.round(item.safety_score)}/100
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-adobe-border/60">
                          <Link
                            href={`/places/${item.id}`}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-adobe-muted hover:text-adobe-dark hover:bg-adobe-bg transition"
                          >
                            Detalle
                          </Link>

                          {/* Hotel Anchor Action for Lodgings */}
                          {item.kind === "lodging" && (
                            <button
                              type="button"
                              onClick={() =>
                                isHotelAnchor
                                  ? setHotelAnchor(null)
                                  : setHotelAnchor(item)
                              }
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                isHotelAnchor
                                  ? "bg-indigo-600 text-white"
                                  : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                              }`}
                            >
                              <Hotel className="w-3.5 h-3.5" />
                              <span>{isHotelAnchor ? "Hotel Ancla" : "Fijar Ancla"}</span>
                            </button>
                          )}

                          {/* Add to Active Day Button */}
                          <button
                            type="button"
                            disabled={isAlreadyInActiveDay}
                            onClick={() => setPlaceToAdd(item)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-2xs ${
                              isAlreadyInActiveDay
                                ? "bg-emerald-100 text-emerald-800 cursor-default"
                                : "bg-moche-600 hover:bg-moche-700 text-white cursor-pointer"
                            }`}
                          >
                            {isAlreadyInActiveDay ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>En {activeDayLabel}</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Elegir viaje y día</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Show more places button */}
              {displayCount < filteredPlacesList.length && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setDisplayCount((prev) => prev + 12)}
                    className="px-5 py-2.5 rounded-xl bg-adobe-bg hover:bg-adobe-border text-adobe-dark font-bold text-xs transition border border-adobe-border cursor-pointer"
                  >
                    Mostrar más lugares ({filteredPlacesList.length - displayCount} restantes)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* MIS VIAJES: MODAL / DRAWER FOR MULTI-TRIP MANAGEMENT              */}
        {/* ------------------------------------------------------------------ */}
        {isTripsDrawerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in">
            <div
              className="bg-white rounded-3xl border border-adobe-border shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="p-5 sm:p-6 border-b border-adobe-border flex items-center justify-between gap-3 bg-adobe-bg/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-moche-50 border border-moche-200 text-moche-600 flex items-center justify-center shrink-0">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-bold text-adobe-dark flex items-center gap-2">
                      <span>Mis Viajes Planificados</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-moche-100 text-moche-800 font-bold">
                        {savedTrips.length}
                      </span>
                    </h2>
                    <p className="text-xs text-adobe-muted">
                      Guarda, duplica y cambia entre múltiples itinerarios en La Libertad.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsTripsDrawerOpen(false)}
                  className="p-2 rounded-xl text-adobe-muted hover:text-adobe-dark hover:bg-adobe-bg transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Action: Create New Trip */}
              <div className="p-4 sm:p-5 border-b border-adobe-border/70 bg-adobe-bg/20">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const dest = newTripDestinationModal.trim() || "Trujillo";
                    const newId = createNewTrip(dest, `Viaje a ${dest} #${savedTrips.length + 1}`);
                    switchTrip(newId);
                    setNewTripDestinationModal("");
                    setIsTripsDrawerOpen(false);
                    setIsStarted(false);
                  }}
                  className="flex flex-col sm:flex-row items-center gap-2"
                >
                  <div className="relative w-full flex-1">
                    <input
                      type="text"
                      value={newTripDestinationModal}
                      onChange={(e) => setNewTripDestinationModal(e.target.value)}
                      placeholder="Nuevo destino (ej. Huanchaco, Puerto Chicama, Otuzco)..."
                      className="w-full bg-white border border-adobe-border rounded-xl px-3.5 py-2.5 text-xs font-semibold text-adobe-dark focus:ring-2 focus:ring-moche-500 focus:outline-none placeholder:text-adobe-muted"
                    />
                    <MapPin className="w-3.5 h-3.5 text-moche-600 absolute right-3 top-3" />
                  </div>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-moche-600 hover:bg-moche-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Nuevo Viaje</span>
                  </button>
                </form>
              </div>

              {/* Saved Trips List */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-3.5 flex-1 divide-y divide-adobe-border/50">
                {savedTrips.length === 0 && (
                  <p className="rounded-xl border border-dashed border-adobe-border p-6 text-center text-sm text-adobe-muted">
                    No tienes viajes guardados. Crea uno nuevo cuando estés listo.
                  </p>
                )}
                {savedTrips.map((st) => {
                  const isCurrent = st.id === trip.id;
                  const totalStops = st.days.reduce((acc, d) => acc + d.places.length, 0);
                  const firstPlace = st.days.find((d) => d.places.length > 0)?.places[0];

                  return (
                    <div
                      key={st.id}
                      className={`pt-3 first:pt-0 p-3.5 rounded-2xl transition border ${
                        isCurrent
                          ? "bg-moche-50/70 border-moche-300 shadow-2xs"
                          : "bg-white border-adobe-border/70 hover:border-adobe-border"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Left: Thumbnail & Details */}
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <img
                            src={
                              firstPlace
                                ? `/images/places/place_${firstPlace.id}.webp`
                                : "/images/places/place_1.webp"
                            }
                            alt={st.title}
                            className="w-14 h-14 rounded-xl object-cover bg-neutral-200 border border-adobe-border/70 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                "/images/defaults/default_attraction.webp";
                            }}
                          />
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display font-bold text-sm text-adobe-dark truncate">
                                {st.title || `Viaje a ${st.destination}`}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.2 rounded-full bg-moche-600 text-white">
                                  Activo
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-adobe-muted flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-adobe-dark">
                                {st.destination}
                              </span>
                              <span>&bull;</span>
                              <span>
                                {st.startDate} &mdash; {st.endDate}
                              </span>
                            </p>

                            <div className="text-[11px] text-adobe-muted flex items-center gap-2 pt-0.5">
                              <span className="font-semibold text-moche-700 bg-moche-50 px-2 py-0.2 rounded border border-moche-200">
                                {totalStops} paradas
                              </span>
                              <span>&bull;</span>
                              <span>{st.days.length} días</span>
                              {st.hotelAnchor && (
                                <>
                                  <span>&bull;</span>
                                  <span className="text-indigo-800 text-[10px] font-semibold truncate max-w-xs">
                                    🏨 {st.hotelAnchor.name}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-adobe-border/60">
                          {!isCurrent ? (
                            <button
                              type="button"
                              onClick={() => {
                                switchTrip(st.id);
                                setIsStarted(true);
                                setIsTripsDrawerOpen(false);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-moche-600 hover:bg-moche-700 text-white font-bold text-xs shadow-2xs transition cursor-pointer"
                            >
                              Abrir Itinerario
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-moche-700 bg-moche-100 px-3 py-1.5 rounded-xl">
                              En pantalla
                            </span>
                          )}

                          {/* Duplicate Trip */}
                          <button
                            type="button"
                            onClick={() => duplicateTrip(st.id)}
                            title="Duplicar este viaje como plantilla"
                            className="p-1.5 rounded-xl bg-adobe-bg hover:bg-adobe-border text-adobe-dark text-xs transition cursor-pointer border border-adobe-border"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Trip / Reset if only 1 exists */}
                          <button
                            type="button"
                            onClick={() => {
                              const isOnlyOne = savedTrips.length <= 1;
                              if (
                                window.confirm(
                                  isOnlyOne
                                    ? `¿Deseas reiniciar y vaciar "${st.title}"? Se borrarán todas sus paradas.`
                                    : `¿Estás seguro de eliminar "${st.title}"?`
                                )
                              ) {
                                deleteTrip(st.id);
                                setRouteStats(null);
                                setRouteSegments([]);
                                setSelectedLegId(null);
                                setPlaceToAdd(null);
                                setSelectedMapPlace(null);
                              }
                            }}
                            title={
                              savedTrips.length <= 1
                                ? "Vaciar y reiniciar este viaje"
                                : "Eliminar este viaje"
                            }
                            className="p-1.5 rounded-xl text-xs transition border cursor-pointer bg-adobe-bg hover:bg-red-50 text-neutral-500 hover:text-red-600 border-adobe-border"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 sm:p-5 border-t border-adobe-border bg-adobe-bg/40 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs text-adobe-muted">
                <span>Persistido automáticamente en almacenamiento local</span>
                <div className="flex items-center justify-end gap-2">
                  {savedTrips.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsDeleteAllConfirmOpen(true)}
                      className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 font-bold text-red-700 hover:bg-red-100 transition cursor-pointer"
                    >
                      Eliminar todos
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsTripsDrawerOpen(false)}
                    className="px-4 py-2 rounded-xl bg-white border border-adobe-border font-bold text-adobe-dark hover:bg-adobe-bg transition cursor-pointer"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
