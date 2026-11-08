'use client';

import React, { useState, useEffect } from 'react';
import type { Place } from '@/lib/types';
import { useTripCache } from '@/hooks/useTripCache';
import { optimizeDayRoute } from '@/lib/routeOptimizer';
import { fetchOsrmRoute, type OsrmRouteResult } from '@/lib/osrmService';
import { getTransitBetweenPlaces } from '@/lib/transitService';
import { getTransportImage } from '@/lib/transportImages';
import {
  Calendar,
  Clock,
  Compass,
  GripVertical,
  Hotel,
  MapPin,
  Navigation,
  Plus,
  Route,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

interface TripPlannerProps {
  currentPlace?: Place;
  availablePlaces?: Place[];
  onRouteCalculated?: (route: OsrmRouteResult | null, orderedPlaces: Place[]) => void;
  onSelectPlace?: (place: Place) => void;
  onPlaceAdded?: (place: Place, dayId: string) => void;
  className?: string;
}

export default function TripPlanner({
  currentPlace,
  availablePlaces = [],
  onRouteCalculated,
  onSelectPlace,
  onPlaceAdded,
  className = '',
}: TripPlannerProps) {
  const {
    trip,
    activeDay,
    additionalDayDates,
    isHydrated,
    addDay,
    removeDay,
    setActiveDayId,
    addPlaceToDay,
    removePlaceFromDay,
    reorderPlaces,
    setDayPlaces,
    setHotelAnchor,
    setTravelMode,
    setIsStarted,
    clearTrip,
  } = useTripCache();

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [routeStats, setRouteStats] = useState<{ km: number; min: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [urbanFare, setUrbanFare] = useState(2.5);
  const [newDayDate, setNewDayDate] = useState('');
  const selectedNewDayDate = additionalDayDates.includes(newDayDate)
    ? newDayDate
    : additionalDayDates[0] || '';

  useEffect(() => {
    let isMounted = true;
    fetch('/api/transit/fare')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Tarifa API respondió ${response.status}`);
        const data = (await response.json()) as { urbanBaseFare?: unknown };
        if (typeof data.urbanBaseFare !== 'number' || data.urbanBaseFare <= 0) {
          throw new Error('La API tarifaria devolvió un importe inválido');
        }
        if (isMounted) setUrbanFare(data.urbanBaseFare);
      })
      .catch((error: unknown) => {
        console.error('No se pudo cargar la tarifa urbana del catálogo GTFS:', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute / recalculate route when day's places or mode changes
  const updateRouteGeometry = async (placesToRoute: Place[]) => {
    if (placesToRoute.length < 2) {
      setRouteStats(null);
      onRouteCalculated?.(null, placesToRoute);
      return;
    }

    setIsCalculating(true);
    const waypoints: [number, number][] = [];

    if (trip.hotelAnchor) {
      waypoints.push([trip.hotelAnchor.lat, trip.hotelAnchor.lon]);
    }

    placesToRoute.forEach((p) => {
      waypoints.push([p.lat, p.lon]);
    });

    if (trip.hotelAnchor) {
      waypoints.push([trip.hotelAnchor.lat, trip.hotelAnchor.lon]);
    }

    const res = await fetchOsrmRoute(waypoints, trip.travelMode);
    if (res) {
      setRouteStats({ km: res.distanceKm, min: res.durationMin });
      onRouteCalculated?.(res, placesToRoute);
    }
    setIsCalculating(false);
  };

  // Run optimization using TREK 2-Opt algorithm
  const handleOptimize = async () => {
    if (!activeDay || activeDay.places.length <= 1) return;
    setIsCalculating(true);

    const optimized = optimizeDayRoute(activeDay.places, trip.hotelAnchor);
    setDayPlaces(activeDay.id, optimized);
    await updateRouteGeometry(optimized);
    setIsCalculating(false);
  };

  // Recalculate route on active day change
  useEffect(() => {
    if (isHydrated && activeDay) {
      void Promise.resolve().then(() => updateRouteGeometry(activeDay.places));
    }
  }, [activeDay?.id, trip.travelMode, trip.hotelAnchor?.id, isHydrated]);

  // Drag and Drop handlers
  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (dropIdx: number) => {
    if (draggedIdx === null || draggedIdx === dropIdx || !activeDay) return;
    reorderPlaces(activeDay.id, draggedIdx, dropIdx);
    setDraggedIdx(null);
  };

  if (!isHydrated) {
    return (
      <div className="p-6 rounded-2xl bg-white border border-adobe-border shadow-sm animate-pulse text-xs text-adobe-muted">
        Cargando itinerario y rutas locales...
      </div>
    );
  }

  // Filter available places for adding
  const searchResults = availablePlaces
    .filter(
      (p) =>
        !activeDay?.places.some((ap) => ap.id === p.id) &&
        (p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .slice(0, 6);

  const isCurrentPlaceInActiveDay =
    currentPlace && activeDay?.places.some((p) => p.id === currentPlace.id);
  const activeDayNumber = activeDay
    ? trip.days.findIndex((day) => day.id === activeDay.id) + 1
    : 1;
  const transitBudget = activeDay
    ? activeDay.places.slice(0, -1).reduce(
        (total, place, index) =>
          total + getTransitBetweenPlaces(place, activeDay.places[index + 1], urbanFare).farePen,
        0
      )
    : 0;

  return (
    <div className={`bg-white rounded-2xl border border-adobe-border shadow-sm p-5 space-y-5 ${className}`}>
      {/* Header & Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-adobe-border/70 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-teal-50 text-teal-800 border border-teal-200 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            Organizador de Itinerario
          </div>
          <h2 className="text-lg font-display font-bold text-adobe-dark flex items-center gap-2">
            <Route className="w-5 h-5 text-moche-600" />
            <span>Itinerario de Viaje Multi-Día</span>
          </h2>
          <p className="text-xs text-adobe-muted">
            Organiza tus visitas, reordena arrastrando y genera la ruta sugerida de recorrido.
          </p>
        </div>

        {/* Mode Indicator (Transit/Vehicle Only - Walking removed for regional safety) */}
        <div className="flex items-center gap-1.5 bg-adobe-bg border border-adobe-border px-3 py-1.5 rounded-xl text-xs font-semibold text-adobe-dark self-start sm:self-auto">
          <Navigation className="w-3.5 h-3.5 text-moche-600" />
          <span>Transporte / Vehículo</span>
        </div>
      </div>

      {/* Days Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {trip.days.map((d, index) => {
          const isActive = d.id === trip.activeDayId;
          return (
            <div
              key={d.id}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
                isActive
                  ? 'bg-moche-500 text-white border-moche-600 shadow-sm'
                  : 'bg-adobe-bg text-adobe-muted hover:text-adobe-dark border-adobe-border hover:bg-adobe-border/40'
              }`}
              onClick={() => setActiveDayId(d.id)}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Día {index + 1} · {d.date}</span>
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive ? 'bg-white/20 text-white' : 'bg-adobe-border text-adobe-dark'
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
                  <X className="w-3 h-3" />
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
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-dashed border-adobe-border hover:border-moche-500 text-adobe-muted hover:text-moche-600 transition shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir día</span>
            </button>
          </>
        )}
      </div>

      {/* Hotel Anchor Card */}
      <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Hotel className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-indigo-950">
              {trip.hotelAnchor ? trip.hotelAnchor.name : 'Hospedaje de Partida y Retorno (Ancla)'}
            </div>
            <div className="text-[11px] text-indigo-700">
              {trip.hotelAnchor
                ? 'Punto base de partida y llegada del recorrido diario.'
                : 'Opcional: define tu hotel para cerrar el circuito sin desvíos.'}
            </div>
          </div>
        </div>

        {trip.hotelAnchor ? (
          <button
            type="button"
            onClick={() => setHotelAnchor(null)}
            className="text-[11px] font-semibold text-indigo-800 hover:text-red-600 self-end sm:self-auto underline"
          >
            Quitar hotel ancla
          </button>
        ) : (
          currentPlace?.kind === 'lodging' && (
            <button
              type="button"
              onClick={() => setHotelAnchor(currentPlace)}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold text-[11px] hover:bg-indigo-700 transition"
            >
              Fijar este hotel
            </button>
          )
        )}
      </div>

      {/* Action Bar for Current Place (if on Place Detail) */}
      {currentPlace && (
        <div className="p-3 bg-adobe-bg rounded-xl border border-adobe-border flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-moche-600" />
            <span className="font-semibold text-adobe-dark truncate max-w-xs">{currentPlace.name}</span>
          </div>

          {isCurrentPlaceInActiveDay ? (
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              ✓ Incluido en Día {activeDayNumber}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!activeDay) return;
                addPlaceToDay(activeDay.id, currentPlace);
                setIsStarted(true);
                onPlaceAdded?.(currentPlace, activeDay.id);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#B85028] hover:bg-[#96401E] text-white font-bold transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir y ver más lugares</span>
            </button>
          )}
        </div>
      )}

      {/* Itinerary Stops List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-adobe-muted px-1">
          <span className="font-semibold uppercase tracking-wider text-[11px]">
            Paradas programadas ({activeDay?.places.length || 0})
          </span>
          <span className="text-[11px]">Arrastra las barras para reordenar</span>
        </div>

        {activeDay?.places.length === 0 ? (
          <div className="p-6 text-center rounded-xl border-2 border-dashed border-adobe-border text-adobe-muted text-xs space-y-1">
            <p className="font-medium">No hay lugares en este día todavía.</p>
            <p className="text-[11px]">
              Explora los atractivos y haz clic en &ldquo;Añadir al itinerario&rdquo; para armar tu ruta.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeDay?.places.map((place, idx) => {
              const nextPlace = activeDay.places[idx + 1];
              const transit = nextPlace
                ? getTransitBetweenPlaces(place, nextPlace, urbanFare)
                : null;

              return (
                <React.Fragment key={place.id}>
                  <div
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(idx)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      draggedIdx === idx
                        ? 'opacity-40 border-dashed border-moche-500 bg-moche-50'
                        : 'bg-white border-adobe-border hover:border-moche-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="cursor-grab text-adobe-muted hover:text-adobe-dark">
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#B85028] text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div
                          onClick={() => onSelectPlace?.(place)}
                          className="font-bold text-xs text-adobe-dark truncate hover:text-moche-600 cursor-pointer"
                        >
                          {place.name}
                        </div>
                        <div className="text-[11px] text-adobe-muted flex items-center gap-1.5 mt-0.5">
                          <span className="capitalize">{place.kind}</span>
                          {place.score != null && (
                            <span>
                              • {place.score >= 80 ? "Muy recomendable" : place.score >= 60 ? "Recomendable" : "Planifica el traslado"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      aria-label={`Quitar ${place.name}`}
                      onClick={() => removePlaceFromDay(activeDay.id, place.id)}
                      className="p-1.5 text-neutral-400 hover:text-red-600 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Public Transit Connection Card Between Stops */}
                  {transit && (
                    <div className="mx-3 my-1.5 p-2.5 bg-amber-50/80 border border-amber-200/90 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {(() => {
                          const transportImage = getTransportImage(transit.serviceName, transit.code);
                          return transportImage ? (
                            <img
                              src={transportImage.image_url}
                              alt={`Imagen referencial de ${transit.serviceName}`}
                              loading="lazy"
                              width={48}
                              height={32}
                              className="h-8 w-12 shrink-0 rounded-md border border-amber-200 object-cover"
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : null;
                        })()}
                        <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs">
                          {transit.vehicleType === 'caminata'
                            ? '🚶'
                            : transit.vehicleType === 'combi'
                            ? '🚐'
                            : transit.vehicleType === 'mototaxi'
                            ? '🛺'
                            : '🚌'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-amber-950 text-xs truncate">{transit.serviceName}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200 text-amber-900 font-mono">
                              {transit.code}
                            </span>
                          </div>
                          <div className="text-[11px] text-amber-800 line-clamp-1 mt-0.5">
                            {transit.instructions}
                          </div>
                          {transit.confidence && (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              Confianza {transit.confidence}
                              {transit.fareRangePen
                                ? ` · rango S/ ${transit.fareRangePen[0].toFixed(2)}–${transit.fareRangePen[1].toFixed(2)}`
                                : ''}
                            </div>
                          )}
                          {transit.routeLegs && (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              {transit.routeLegs.length} tramos · confianza {transit.confidence ?? 'referencial'}
                            </div>
                          )}
                          <div className="text-[10px] text-amber-700/80 flex items-center gap-1.5 mt-0.5">
                            <span className="truncate">Subida: <b>{transit.boardingStop}</b></span>
                            <span>&bull;</span>
                            <span className="truncate">Bajada: <b>{transit.dropoffStop}</b></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-1 border-t sm:border-t-0 pt-1 sm:pt-0 border-amber-200/70 shrink-0">
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-md">
                          {transit.farePen === 0 ? 'Gratis' : `S/ ${transit.farePen.toFixed(2)}`}
                        </span>
                        <span className="text-[10px] font-semibold text-neutral-600">
                          ~{transit.estimatedMinutes} min
                        </span>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Optimizer & Route Metrics Footer */}
      <div className="pt-2 border-t border-adobe-border/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        {routeStats ? (
          <div className="flex items-center gap-3 text-xs text-adobe-dark">
            <div className="flex items-center gap-1 font-semibold">
              <Route className="w-3.5 h-3.5 text-teal-600" />
              <span>{routeStats.km.toFixed(1)} km</span>
            </div>
            <span className="text-adobe-border">•</span>
            <div className="flex items-center gap-1 text-adobe-muted">
              <Clock className="w-3.5 h-3.5" />
              <span>~{routeStats.min} min en transporte vehicular</span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-adobe-muted">
            Agrega al menos 2 paradas para trazar el recorrido.
          </div>
        )}

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {activeDay && activeDay.places.length > 1 && (
            <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
              Transporte: S/ {transitBudget.toFixed(2)}
            </div>
          )}

          {activeDay && activeDay.places.length > 2 && (
            <button
              type="button"
              disabled={isCalculating}
              onClick={handleOptimize}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isCalculating ? 'Optimizando...' : 'Optimizar Recorrido'}</span>
            </button>
          )}

          {activeDay && activeDay.places.length > 0 && (
            <button
              type="button"
              onClick={() => setDayPlaces(activeDay.id, [])}
              className="p-2 text-adobe-muted hover:text-red-600 text-xs transition"
              title="Limpiar paradas del día"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
