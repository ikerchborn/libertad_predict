'use client';

import { useState, useCallback } from 'react';
import type { Place } from '@/lib/types';

export interface TripDay {
  id: string;
  title: string;
  date: string;
  places: Place[];
}

export interface TripState {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  isStarted: boolean;
  notes: string;
  days: TripDay[];
  activeDayId: string;
  hotelAnchor: Place | null;
  travelMode: 'walking' | 'driving';
  createdAt: number;
  updatedAt: number;
}

const STORAGE_MULTI_KEY = 'turismo_saved_trips_v2';
const LEGACY_STORAGE_KEY = 'turismo_trip_itinerary_v1';

export const createDefaultTrip = (destination = 'Trujillo', title?: string): TripState => {
  const idSuffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const now = Date.now();
  const day1Id = `day_1_${idSuffix}`;
  const day2Id = `day_2_${idSuffix}`;

  return {
    id: `trip_${idSuffix}`,
    title: title || `Viaje a ${destination}`,
    destination,
    startDate: '2026-11-12',
    endDate: '2026-11-16',
    isStarted: false,
    notes: '',
    days: [
      { id: day1Id, title: 'Día 1: Arqueología y Costa', date: '2026-11-12', places: [] },
      { id: day2Id, title: 'Día 2: Cultura y Centro Histórico', date: '2026-11-13', places: [] },
    ],
    activeDayId: day1Id,
    hotelAnchor: null,
    travelMode: 'driving',
    createdAt: now,
    updatedAt: now,
  };
};

interface MultiTripStore {
  activeTripId: string;
  trips: TripState[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function coerceNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePlace(raw: unknown): Place | null {
  if (!isPlainObject(raw)) return null;

  const candidate = raw as Record<string, unknown>;
  const lat = coerceNumber(candidate.lat, Number.NaN);
  const lon = coerceNumber(candidate.lon, Number.NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const id = coerceNumber(candidate.id, 0);
  const osmId = coerceNumber(candidate.osm_id, id || Date.now());
  const name = coerceString(candidate.name, 'Lugar sin nombre') || 'Lugar sin nombre';
  const category = candidate.category === 'hotel' || candidate.category === 'restaurant'
    ? candidate.category
    : 'attraction';
  const kind = candidate.kind === 'lodging' || candidate.kind === 'food' || candidate.kind === 'activity' || candidate.kind === 'unclassified'
    ? candidate.kind
    : 'attraction';
  const coastType = candidate.coast_type === 'coastal' ? 'coastal' : 'inland';

  return {
    id: id || Math.max(1, Math.round(Math.abs(osmId || Date.now()))),
    osm_id: osmId || id || Math.round(Date.now()),
    name,
    category: category as Place['category'],
    kind: kind as Place['kind'],
    coast_type: coastType as Place['coast_type'],
    lat,
    lon,
    address: typeof candidate.address === 'string' ? candidate.address : null,
    score: typeof candidate.score === 'number' ? candidate.score : null,
    confidence: typeof candidate.confidence === 'number' ? candidate.confidence : null,
    maps_url: typeof candidate.maps_url === 'string' ? candidate.maps_url : null,
    website: typeof candidate.website === 'string' ? candidate.website : null,
    phone: typeof candidate.phone === 'string' ? candidate.phone : null,
    cuisine: typeof candidate.cuisine === 'string' ? candidate.cuisine : null,
    stars: typeof candidate.stars === 'number' ? candidate.stars : null,
    external_rating: typeof candidate.external_rating === 'number' ? candidate.external_rating : null,
    user_rating_count: typeof candidate.user_rating_count === 'number' ? candidate.user_rating_count : null,
    google_place_id: typeof candidate.google_place_id === 'string' ? candidate.google_place_id : null,
    price_level: typeof candidate.price_level === 'number' ? candidate.price_level : null,
    price_min: typeof candidate.price_min === 'number' ? candidate.price_min : null,
    price_max: typeof candidate.price_max === 'number' ? candidate.price_max : null,
    image_url: typeof candidate.image_url === 'string' ? candidate.image_url : null,
    local_image_path: typeof candidate.local_image_path === 'string' ? candidate.local_image_path : null,
    safety_score: typeof candidate.safety_score === 'number' ? candidate.safety_score : null,
    temp_max_c: typeof candidate.temp_max_c === 'number' ? candidate.temp_max_c : null,
    temp_min_c: typeof candidate.temp_min_c === 'number' ? candidate.temp_min_c : null,
    precipitation_mm: typeof candidate.precipitation_mm === 'number' ? candidate.precipitation_mm : null,
    rain_probability: typeof candidate.rain_probability === 'number' ? candidate.rain_probability : null,
    uv_index: typeof candidate.uv_index === 'number' ? candidate.uv_index : null,
    wave_height_m: typeof candidate.wave_height_m === 'number' ? candidate.wave_height_m : null,
    wave_period_s: typeof candidate.wave_period_s === 'number' ? candidate.wave_period_s : null,
    zone: candidate.zone === 'costa' || candidate.zone === 'valle' || candidate.zone === 'sierra'
      ? candidate.zone
      : undefined,
    profile: candidate.profile === 'surfer' || candidate.profile === 'culture' || candidate.profile === 'family'
      ? candidate.profile
      : undefined,
    image: typeof candidate.image === 'string' ? candidate.image : '',
    description: typeof candidate.description === 'string' ? candidate.description : undefined,
    bestTime: typeof candidate.bestTime === 'string' ? candidate.bestTime : undefined,
    weatherText: typeof candidate.weatherText === 'string' ? candidate.weatherText : undefined,
    surfText: typeof candidate.surfText === 'string' ? candidate.surfText : undefined,
    crowdText: typeof candidate.crowdText === 'string' ? candidate.crowdText : undefined,
  } as Place;
}

function normalizeDay(raw: unknown): TripDay | null {
  if (!isPlainObject(raw)) return null;
  const candidate = raw as Record<string, unknown>;
  const id = coerceString(candidate.id, `day_${Date.now()}`);
  const title = coerceString(candidate.title, 'Día');
  const date = coerceString(candidate.date, '2026-11-12');
  const places = Array.isArray(candidate.places) ? candidate.places.map(normalizePlace).filter(Boolean) as Place[] : [];

  if (!id || !date) return null;
  return {
    id,
    title,
    date,
    places,
  };
}

function normalizeTrip(raw: unknown): TripState | null {
  if (!isPlainObject(raw)) return null;

  const candidate = raw as Record<string, unknown>;
  const fallbackBase = createDefaultTrip();
  const destination = coerceString(candidate.destination, coerceString(candidate.title, 'Trujillo')) || 'Trujillo';
  const startDate = coerceString(candidate.startDate, fallbackBase.startDate);
  const endDate = coerceString(candidate.endDate, fallbackBase.endDate);
  const days = Array.isArray(candidate.days)
    ? candidate.days.map(normalizeDay).filter((day): day is TripDay => Boolean(day))
    : fallbackBase.days;
  const safeDays = days.length > 0 ? syncTripDays(days, startDate, endDate) : fallbackBase.days;
  const hotelAnchor = normalizePlace(candidate.hotelAnchor);
  const activeDayId = safeDays.some((day) => day.id === candidate.activeDayId)
    ? coerceString(candidate.activeDayId, safeDays[0].id)
    : safeDays[0]?.id || fallbackBase.activeDayId;

  return {
    id: coerceString(candidate.id, `trip_${Date.now().toString(36)}`) || `trip_${Date.now().toString(36)}`,
    title: coerceString(candidate.title, `Viaje a ${destination}`) || `Viaje a ${destination}`,
    destination,
    startDate: startDate || fallbackBase.startDate,
    endDate: endDate || fallbackBase.endDate,
    isStarted: typeof candidate.isStarted === 'boolean' ? candidate.isStarted : false,
    notes: typeof candidate.notes === 'string' ? candidate.notes : '',
    days: safeDays,
    activeDayId,
    hotelAnchor,
    travelMode: candidate.travelMode === 'walking' ? 'walking' : 'driving',
    createdAt: typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
      ? candidate.createdAt
      : Date.now(),
    updatedAt: typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : Date.now(),
  };
}

function normalizeMultiTripStore(raw: unknown): MultiTripStore | null {
  if (!isPlainObject(raw)) return null;

  const candidate = raw as Record<string, unknown>;
  const trips = Array.isArray(candidate.trips)
    ? candidate.trips.map(normalizeTrip).filter((trip): trip is TripState => Boolean(trip))
    : [];

  if (trips.length === 0) return null;

  const activeTripId = coerceString(candidate.activeTripId, trips[0].id);
  const resolvedActiveId = trips.some((trip) => trip.id === activeTripId)
    ? activeTripId
    : trips[0].id;

  return {
    activeTripId: resolvedActiveId,
    trips: trips.map((trip) => ({ ...trip, activeDayId: trip.days.some((day) => day.id === trip.activeDayId) ? trip.activeDayId : trip.days[0]?.id || trip.activeDayId })),
  };
}

function renumberDays(days: TripDay[]): TripDay[] {
  return days.map((day, index) => ({
    ...day,
    title: `Día ${index + 1}`,
  }));
}

function getTripDates(startDate: string, endDate: string): string[] {
  const parseDate = (value: string): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (
      date.getFullYear() !== Number(match[1]) ||
      date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3])
    ) {
      return null;
    }
    return date;
  };
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || start > end) {
    return [startDate];
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 366) {
    dates.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function syncTripDays(days: TripDay[], startDate: string, endDate: string): TripDay[] {
  const dates = getTripDates(startDate, endDate);
  const existingByDate = new Map<string, TripDay>();
  const unassignedDays: TripDay[] = [];

  days.forEach((day, index) => {
    const date = day.date || dates[index];
    if (date && dates.includes(date) && !existingByDate.has(date)) {
      existingByDate.set(date, { ...day, date });
    } else {
      unassignedDays.push(day);
    }
  });

  const nextDays = dates.slice(0, 5).map((date, index) => {
    const existingDay = existingByDate.get(date) ?? unassignedDays.shift();
    return existingDay
      ? { ...existingDay, date }
      : {
        id: `day-${date}-${Date.now()}-${index}`,
        title: `Día ${index + 1}`,
        date,
        places: [],
      }
  });
  const scheduledDates = new Set(nextDays.map((day) => day.date));

  for (const date of dates.slice(5)) {
    const existingDay = existingByDate.get(date) ?? unassignedDays.shift();
    if (existingDay && !scheduledDates.has(date)) {
      nextDays.push({ ...existingDay, date });
      scheduledDates.add(date);
    }
  }

  return renumberDays(nextDays);
}

export function useTripCache() {
  const [store, setStore] = useState<MultiTripStore>(() => {
    const initial = createDefaultTrip();
    const baseStore = {
      activeTripId: initial.id,
      trips: [initial],
    };

    try {
      const savedMulti = localStorage.getItem(STORAGE_MULTI_KEY);
      if (savedMulti) {
        const parsed = JSON.parse(savedMulti) as unknown;
        const sanitized = normalizeMultiTripStore(parsed);
        if (sanitized) {
          return sanitized;
        }
      }

      const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacySaved) {
        const parsedLegacy = JSON.parse(legacySaved) as unknown;
        const legacyTrip = normalizeTrip(parsedLegacy);
        if (legacyTrip) {
          const migratedTrip: TripState = {
            ...legacyTrip,
            id: `trip_migrated_${Date.now()}`,
            title: legacyTrip.title || `Viaje a ${legacyTrip.destination || 'Trujillo'}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          const newStore: MultiTripStore = {
            activeTripId: migratedTrip.id,
            trips: [migratedTrip],
          };
          localStorage.setItem(STORAGE_MULTI_KEY, JSON.stringify(newStore));
          return newStore;
        }
      }
    } catch (e) {
      console.warn('Failed to hydrate multi-trip cache:', e);
    }

    return baseStore;
  });
  const isHydrated = true;

  // Save changes to localStorage
  const persistStore = useCallback((nextStore: MultiTripStore): boolean => {
    setStore(nextStore);
    try {
      localStorage.setItem(STORAGE_MULTI_KEY, JSON.stringify(nextStore));
      return true;
    } catch (e) {
      console.warn('Failed to persist multi-trip cache:', e);
      return false;
    }
  }, []);

  // Current active trip
  const currentTrip = store.trips.find((t) => t.id === store.activeTripId) || store.trips[0] || createDefaultTrip();

  // Helper to update active trip
  const updateActiveTrip = useCallback(
    (updater: (prevTrip: TripState) => TripState) => {
      setStore((prevStore) => {
        const tripIndex = prevStore.trips.findIndex((t) => t.id === prevStore.activeTripId);
        const targetTrip = tripIndex >= 0 ? prevStore.trips[tripIndex] : prevStore.trips[0];
        if (!targetTrip) return prevStore;

        const updatedTrip = {
          ...updater(targetTrip),
          updatedAt: Date.now(),
        };

        const nextTrips = [...prevStore.trips];
        if (tripIndex >= 0) {
          nextTrips[tripIndex] = updatedTrip;
        } else {
          nextTrips.push(updatedTrip);
        }

        const nextStore: MultiTripStore = {
          activeTripId: updatedTrip.id,
          trips: nextTrips,
        };

        try {
          localStorage.setItem(STORAGE_MULTI_KEY, JSON.stringify(nextStore));
        } catch (e) {
          console.warn('Failed to persist multi-trip cache:', e);
        }

        return nextStore;
      });
    },
    []
  );

  // Multi-Trip Management Actions
  const createNewTrip = useCallback(
    (destination = 'Trujillo', title?: string) => {
      const newTrip = createDefaultTrip(destination, title);
      const nextStore: MultiTripStore = {
        activeTripId: newTrip.id,
        trips: [newTrip, ...store.trips],
      };
      persistStore(nextStore);
      return newTrip.id;
    },
    [store.trips, persistStore]
  );

  const switchTrip = useCallback(
    (tripId: string) => {
      if (store.trips.some((t) => t.id === tripId)) {
        persistStore({
          ...store,
          activeTripId: tripId,
        });
      }
    },
    [store, persistStore]
  );

  const deleteTrip = useCallback(
    (tripId: string) => {
      const remaining = store.trips.filter((t) => t.id !== tripId);
      const finalTrips = remaining.length > 0 ? remaining : [createDefaultTrip()];
      const nextActiveId =
        store.activeTripId === tripId ? finalTrips[0].id : store.activeTripId;

      persistStore({
        activeTripId: nextActiveId,
        trips: finalTrips,
      });
    },
    [store, persistStore]
  );

  const deleteAllTrips = useCallback(() => {
    const freshTrip = createDefaultTrip();
    persistStore({
      activeTripId: freshTrip.id,
      trips: [freshTrip],
    });
  }, [persistStore]);

  const duplicateTrip = useCallback(
    (tripId: string) => {
      const source = store.trips.find((t) => t.id === tripId);
      if (!source) return;

      const newIdSuffix = Date.now().toString(36);
      const clonedTrip: TripState = {
        ...JSON.parse(JSON.stringify(source)),
        id: `trip_clone_${newIdSuffix}`,
        title: `${source.title} (Copia)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      persistStore({
        activeTripId: clonedTrip.id,
        trips: [clonedTrip, ...store.trips],
      });
    },
    [store, persistStore]
  );

  const renameTrip = useCallback(
    (tripId: string, newTitle: string) => {
      const nextTrips = store.trips.map((t) =>
        t.id === tripId ? { ...t, title: newTitle, updatedAt: Date.now() } : t
      );
      persistStore({
        ...store,
        trips: nextTrips,
      });
    },
    [store, persistStore]
  );

  // Single trip manipulation methods (operating on active trip)
  const addDay = useCallback((date: string) => {
    updateActiveTrip((prev) => {
      const addableDates = getTripDates(prev.startDate, prev.endDate).slice(5);
      if (!addableDates.includes(date) || prev.days.some((day) => day.date === date)) return prev;
      const newNum = prev.days.length + 1;
      const newDay: TripDay = {
        id: `day-${date}-${Date.now()}`,
        title: `Día ${newNum}: Nuevas Rutas`,
        date,
        places: [],
      };
      const days = renumberDays([...prev.days, newDay].sort((a, b) => a.date.localeCompare(b.date)));
      return {
        ...prev,
        days,
        activeDayId: newDay.id,
      };
    });
  }, [updateActiveTrip]);

  const removeDay = useCallback((dayId: string) => {
    updateActiveTrip((prev) => {
      const mandatoryDates = new Set(getTripDates(prev.startDate, prev.endDate).slice(0, 5));
      const dayToRemove = prev.days.find((day) => day.id === dayId);
      if (
        prev.days.length <= 1 ||
        !dayToRemove ||
        mandatoryDates.has(dayToRemove.date)
      ) {
        return prev;
      }
      const nextDays = renumberDays(prev.days.filter((d) => d.id !== dayId));
      const nextActive = prev.activeDayId === dayId ? nextDays[0].id : prev.activeDayId;
      return { ...prev, days: nextDays, activeDayId: nextActive };
    });
  }, [updateActiveTrip]);

  const setActiveDayId = useCallback((id: string) => {
    updateActiveTrip((prev) => ({ ...prev, activeDayId: id }));
  }, [updateActiveTrip]);

  const addPlaceToDay = useCallback((dayId: string, place: Place) => {
    updateActiveTrip((prev) => {
      const day = prev.days.find((d) => d.id === dayId);
      if (!day) return prev;
      if (day.places.some((p) => p.id === place.id)) return prev;

      return {
        ...prev,
        days: prev.days.map((d) =>
          d.id === dayId ? { ...d, places: [...d.places, place] } : d
        ),
      };
    });
  }, [updateActiveTrip]);

  const removePlaceFromDay = useCallback((dayId: string, placeId: number) => {
    updateActiveTrip((prev) => ({
      ...prev,
      days: prev.days.map((d) =>
        d.id === dayId ? { ...d, places: d.places.filter((p) => p.id !== placeId) } : d
      ),
    }));
  }, [updateActiveTrip]);

  const reorderPlaces = useCallback((dayId: string, startIndex: number, endIndex: number) => {
    updateActiveTrip((prev) => {
      const day = prev.days.find((d) => d.id === dayId);
      if (!day) return prev;

      const items = Array.from(day.places);
      const [reorderedItem] = items.splice(startIndex, 1);
      items.splice(endIndex, 0, reorderedItem);

      return {
        ...prev,
        days: prev.days.map((d) => (d.id === dayId ? { ...d, places: items } : d)),
      };
    });
  }, [updateActiveTrip]);

  const setDayPlaces = useCallback((dayId: string, places: Place[]) => {
    updateActiveTrip((prev) => ({
      ...prev,
      days: prev.days.map((d) => (d.id === dayId ? { ...d, places } : d)),
    }));
  }, [updateActiveTrip]);

  const setHotelAnchor = useCallback((hotel: Place | null) => {
    updateActiveTrip((prev) => ({ ...prev, hotelAnchor: hotel }));
  }, [updateActiveTrip]);

  const setTravelMode = useCallback((mode: 'walking' | 'driving') => {
    updateActiveTrip((prev) => ({ ...prev, travelMode: mode }));
  }, [updateActiveTrip]);

  const setTripDetails = useCallback((details: { destination?: string; startDate?: string; endDate?: string; title?: string }) => {
    updateActiveTrip((prev) => {
      const updatedTrip = {
        ...prev,
        ...details,
        title: details.title || (details.destination ? `Viaje a ${details.destination}` : prev.title),
      };
      const days = syncTripDays(updatedTrip.days, updatedTrip.startDate, updatedTrip.endDate);
      const activeDayId = days.some((day) => day.id === updatedTrip.activeDayId)
        ? updatedTrip.activeDayId
        : days[0]?.id ?? updatedTrip.activeDayId;
      return { ...updatedTrip, days, activeDayId };
    });
  }, [updateActiveTrip]);

  const setIsStarted = useCallback((isStarted: boolean) => {
    updateActiveTrip((prev) => ({ ...prev, isStarted }));
  }, [updateActiveTrip]);

  const setNotes = useCallback((notes: string): boolean => {
    const nextStore: MultiTripStore = {
      ...store,
      trips: store.trips.map((trip) =>
        trip.id === store.activeTripId
          ? { ...trip, notes, updatedAt: Date.now() }
          : trip
      ),
    };
    return persistStore(nextStore);
  }, [persistStore, store]);

  const clearTrip = useCallback(() => {
    updateActiveTrip((prev) => ({
      ...createDefaultTrip(prev.destination),
      id: prev.id,
      title: prev.title,
    }));
  }, [updateActiveTrip]);

  const activeDay = currentTrip.days.find((d) => d.id === currentTrip.activeDayId) || currentTrip.days[0];
  const additionalDayDates = getTripDates(currentTrip.startDate, currentTrip.endDate)
    .slice(5)
    .filter((date) => !currentTrip.days.some((day) => day.date === date));

  return {
    // Current Active Trip (aliased to trip for compatibility)
    trip: currentTrip,
    activeDay,
    additionalDayDates,
    isHydrated,

    // Multi-trip store & actions
    savedTrips: store.trips,
    activeTripId: store.activeTripId,
    createNewTrip,
    switchTrip,
    deleteTrip,
    deleteAllTrips,
    duplicateTrip,
    renameTrip,

    // Trip editing actions
    addDay,
    removeDay,
    setActiveDayId,
    addPlaceToDay,
    removePlaceFromDay,
    reorderPlaces,
    setDayPlaces,
    setHotelAnchor,
    setTravelMode,
    setTripDetails,
    setIsStarted,
    setNotes,
    clearTrip,
  };
}
