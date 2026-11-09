'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import type { NearbyPlace, Place, PlaceDetail } from '@/lib/types';

export interface MapRouteSegment {
  routeId?: string;
  kind: 'walking' | 'transit' | 'driving';
  coordinates: [number, number][];
  label: string;
  distanceKm?: number;
  routeColor?: string;
  legId?: string;
  tripLabel?: string;
  estimatedMinutes?: number;
  farePen?: number;
  fareRangePen?: [number, number];
  walkPhase?: 'to-board' | 'transfer' | 'to-place';
  isApproximate?: boolean;
}

interface PlaceMapProps {
  place: PlaceDetail;
  nearby?: NearbyPlace[];
  routePolyline?: [number, number][];
  routePlaces?: Place[];
  hotelAnchor?: Place | null;
  routeSegments?: MapRouteSegment[];
  selectedLegId?: string | null;
  onSelectLeg?: (legId: string) => void;
  onSelectPlace?: (place: Place) => void;
  simplified?: boolean;
}

export default function PlaceMap({
  place,
  nearby = [],
  routePolyline = [],
  routePlaces = [],
  hotelAnchor = null,
  routeSegments = [],
  selectedLegId = null,
  onSelectLeg,
  onSelectPlace,
  simplified = false,
}: PlaceMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const routeLayersRef = useRef<Map<string, LayerGroup>>(new Map());
  const itineraryMarkersLayerRef = useRef<LayerGroup | null>(null);
  const onSelectLegRef = useRef(onSelectLeg);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const hiddenRouteKeysRef = useRef<Set<string>>(new Set());
  const [mapError, setMapError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hiddenRouteKeys, setHiddenRouteKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [showItineraryMarkers, setShowItineraryMarkers] = useState(true);
  const [isLegendOpen, setIsLegendOpen] = useState(false);

  useEffect(() => {
    onSelectLegRef.current = onSelectLeg;
  }, [onSelectLeg]);

  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace;
  }, [onSelectPlace]);
  const routeOptions = routeSegments.reduce<
    Array<{
      key: string;
      label: string;
      isTransit: boolean;
      legId?: string;
      tripLabel?: string;
      estimatedMinutes?: number;
      farePen?: number;
      fareRangePen?: [number, number];
      routeColor?: string;
    }>
  >((routes, segment, index) => {
    const key = segment.routeId ?? segment.routeColor ?? `segment-${index}`;
    const shortLabel =
      segment.kind === 'transit'
        ? segment.label.split(':')[0]
        : segment.label;
    const existing = routes.find((route) => route.key === key);
    if (existing) {
      if (segment.kind === 'transit' && !existing.isTransit) {
        existing.label = shortLabel;
        existing.isTransit = true;
        existing.legId = segment.legId;
        existing.estimatedMinutes = segment.estimatedMinutes;
        existing.farePen = segment.farePen;
        existing.fareRangePen = segment.fareRangePen;
        existing.routeColor = segment.routeColor;
      }
      return routes;
    }
    routes.push({
      key,
      label: shortLabel,
      isTransit: segment.kind === 'transit',
      legId: segment.legId,
      tripLabel: segment.tripLabel,
      estimatedMinutes: segment.estimatedMinutes,
      farePen: segment.farePen,
      fareRangePen: segment.fareRangePen,
      routeColor: segment.routeColor,
    });
    return routes;
  }, []);

  const toggleRoute = (key: string) => {
    setHiddenRouteKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      hiddenRouteKeysRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    let isMounted = true;
    const routeLayers = new Map<string, LayerGroup>();
    let itineraryMarkersLayer: LayerGroup | null = null;

    async function initMap() {
      setMapError(null);
      if (!mapContainerRef.current) return;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const L = await import('leaflet');

      if (!isMounted || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        scrollWheelZoom: false,
        zoomAnimation: false,
        markerZoomAnimation: false,
        fadeAnimation: false,
      }).setView([place.lat, place.lon], 14);

      mapInstanceRef.current = map;
      routeLayersRef.current = routeLayers;
      itineraryMarkersLayer = L.layerGroup().addTo(map);
      itineraryMarkersLayerRef.current = itineraryMarkersLayer;

      // Use the canonical OSM tile host; the a/b/c subdomains are not policy-compliant.
      L.tileLayer(
        process.env.NEXT_PUBLIC_MAP_TILE_URL ??
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19,
        referrerPolicy: 'strict-origin-when-cross-origin',
        updateWhenIdle: true,
        keepBuffer: 1,
        }
      ).addTo(map);

      // Main place marker icon (Terracotta Moche)
      const mainIcon = L.divIcon({
        className: 'custom-main-pin',
        html: `
          <div style="
            background: #B85028;
            color: white;
            width: 38px;
            height: 38px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(184, 80, 40, 0.45);
            border: 3px solid white;
            font-size: 18px;
            font-weight: bold;
          ">
            ★
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      const mainMarker = routePlaces.some((routePlace) => routePlace.id === place.id)
        ? null
        : L.marker([place.lat, place.lon], {
            icon: mainIcon,
            title: place.name,
            alt: `Ver información de ${place.name}`,
          }).addTo(map);
      mainMarker?.on('click', () => onSelectPlaceRef.current?.(place));

      const bounds = L.latLngBounds([L.latLng(place.lat, place.lon)]);

      // Add nearby markers
      nearby.forEach((nb) => {
        const np = nb.place;
        if (!np.lat || !np.lon) return;

        bounds.extend(L.latLng(np.lat, np.lon));

        let bgColor = '#4F46E5'; // lodging (indigo)
        let iconChar = '🛏️';
        if (np.kind === 'food') {
          bgColor = '#D97706'; // food (amber)
          iconChar = '🍽️';
        } else if (np.kind === 'activity') {
          bgColor = '#0D9488'; // activity (teal)
          iconChar = '🏄';
        }

        const nearbyIcon = L.divIcon({
          className: 'custom-nearby-pin',
          html: `
            <div style="
              background: ${bgColor};
              color: white;
              width: 30px;
              height: 30px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px rgba(0,0,0,0.25);
              border: 2px solid white;
              font-size: 13px;
            ">
              ${iconChar}
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        const m = L.marker([np.lat, np.lon], {
          icon: nearbyIcon,
          title: np.name,
          alt: `Ver información de ${np.name}`,
        }).addTo(map);
        m.on('click', () => onSelectPlaceRef.current?.(np));
      });

      // 1. Render Hotel Anchor marker if present
      if (hotelAnchor && hotelAnchor.lat && hotelAnchor.lon) {
        bounds.extend(L.latLng(hotelAnchor.lat, hotelAnchor.lon));
        const hotelIcon = L.divIcon({
          className: 'custom-hotel-pin',
          html: `
            <div style="
              background: #4F46E5;
              color: white;
              width: 34px;
              height: 34px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 10px rgba(79, 70, 229, 0.45);
              border: 3px solid white;
              font-size: 14px;
            ">
              🏨
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        L.marker([hotelAnchor.lat, hotelAnchor.lon], {
          icon: hotelIcon,
          title: hotelAnchor.name,
          alt: `Ver información de ${hotelAnchor.name}`,
        })
          .addTo(map)
          .on('click', () => onSelectPlaceRef.current?.(hotelAnchor));
      }

      // 2. Render Sequence Pins (#1, #2, #3...) for Day Itinerary
      if (routePlaces && routePlaces.length > 0) {
        const markersLayer = itineraryMarkersLayer;
        if (markersLayer) {
          routePlaces.forEach((rp, idx) => {
            if (!rp.lat || !rp.lon) return;
            bounds.extend(L.latLng(rp.lat, rp.lon));

          const placeIcon =
            rp.kind === 'lodging' ? '🛏️' :
            rp.kind === 'food' ? '🍽️' :
            rp.kind === 'activity' ? '✦' : '🏛️';
          const orderIcon = L.divIcon({
            className: 'custom-order-pin',
            html: `
              <div style="
                background: #0D9488;
                color: white;
                min-width: 42px;
                height: 36px;
                border-radius: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 3px;
                box-shadow: 0 3px 10px rgba(13, 148, 136, 0.45);
                border: 2px solid white;
                font-weight: bold;
                font-size: 13px;
                padding: 0 5px;
              ">
                ${idx + 1}
                <span aria-hidden="true" style="font-size:13px">${placeIcon}</span>
              </div>
            `,
            iconSize: [42, 36],
            iconAnchor: [21, 18],
          });

            L.marker([rp.lat, rp.lon], {
              icon: orderIcon,
              zIndexOffset: 1000,
              title: rp.name,
              alt: `Ver información de ${rp.name}`,
            })
              .addTo(markersLayer)
              .on('click', () => {
                onSelectPlaceRef.current?.(rp);
              });
          });
        }
      }

      // 3. Render Route Polyline from OSRM
      if (routeSegments.length > 0) {
        routeSegments.forEach((segment, index) => {
          if (segment.coordinates.length < 2) return;
          const routeKey = segment.routeId ?? segment.routeColor ?? `segment-${index}`;
          let routeLayer = routeLayers.get(routeKey);
          if (!routeLayer) {
            routeLayer = L.layerGroup();
            routeLayers.set(routeKey, routeLayer);
          }
          const color =
            segment.kind === 'walking'
              ? '#1D4ED8'
              : segment.kind === 'transit'
                ? segment.routeColor ?? '#D97706'
                : '#64748B';
          const legClass = `map-route-leg-${segment.legId ?? 'other'}`;
          L.polyline(segment.coordinates, {
            color: '#fff',
            weight: segment.kind === 'transit' ? 9 : 6,
            opacity: 0.85,
            dashArray: segment.kind === 'walking'
              ? '4 7'
              : segment.isApproximate
                ? '6 7'
                : undefined,
            className: `map-route-casing ${legClass}`,
            lineJoin: 'round',
          }).addTo(routeLayer);
          const line = L.polyline(segment.coordinates, {
            color,
            weight: segment.kind === 'transit' ? 5 : 3,
            opacity: 0.9,
            dashArray: segment.kind === 'walking'
              ? '4 7'
              : segment.isApproximate
                ? '6 7'
                : undefined,
            className: `map-route-line map-route-${segment.kind} ${legClass}`,
            lineJoin: 'round',
          }).addTo(routeLayer);
          line.bindTooltip(
            `${segment.label}${segment.distanceKm != null ? ` · ${segment.distanceKm.toFixed(1)} km` : ''}`,
            { sticky: true }
          );
          if (segment.kind === 'transit' && segment.estimatedMinutes != null) {
            const midpoint =
              segment.coordinates[Math.floor(segment.coordinates.length / 2)];
            const durationIcon = L.divIcon({
              className: `map-route-duration-pin ${legClass}`,
              html: `<span title="Tiempo estimado del bus; no incluye espera">Leg ${segment.legId ?? '?'} · bus ~${segment.estimatedMinutes} min</span>`,
              iconSize: [145, 26],
              iconAnchor: [72, 13],
            });
            L.marker(midpoint, {
              icon: durationIcon,
              keyboard: false,
              interactive: false,
            }).addTo(routeLayer);
          }
          const start = segment.coordinates[0];
          const end = segment.coordinates[segment.coordinates.length - 1];
          const endpointIcon = (action: string, label: string) =>
            L.divIcon({
              className: `route-endpoint-pin ${legClass}`,
              html: `<div aria-label="${label}">🚌 ${action} ${segment.legId ?? ''}</div>`,
              iconSize: [88, 30],
              iconAnchor: [44, 43],
            });
          if (segment.kind === 'transit') {
            L.marker(start, {
              icon: endpointIcon('Sube', `Sube ${segment.legId ?? ''}`),
              zIndexOffset: 700,
            })
              .addTo(routeLayer)
              .bindTooltip(`Leg ${segment.legId ?? ''} · Sube en el paradero indicado`)
              .on('click', () => {
                if (segment.legId) onSelectLegRef.current?.(segment.legId);
              });
            L.marker(end, {
              icon: endpointIcon('Baja', `Baja ${segment.legId ?? ''}`),
              zIndexOffset: 700,
            })
              .addTo(routeLayer)
              .bindTooltip(`Leg ${segment.legId ?? ''} · Baja en el paradero indicado`)
              .on('click', () => {
                if (segment.legId) onSelectLegRef.current?.(segment.legId);
              });
          }
          segment.coordinates.forEach(([lat, lon]) => bounds.extend(L.latLng(lat, lon)));
        });
        routeLayers.forEach((layer, key) => {
          if (!hiddenRouteKeysRef.current.has(key)) layer.addTo(map);
        });
      } else if (routePolyline && routePolyline.length > 1) {
        L.polyline(routePolyline, {
          color: '#0D9488',
          weight: 5,
          opacity: 0.9,
          lineJoin: 'round',
        }).addTo(map);

        routePolyline.forEach(([lat, lon]) => {
          bounds.extend(L.latLng(lat, lon));
        });
      }

      // Fit map to show all elements
      if (nearby.length > 0 || (routePlaces && routePlaces.length > 0) || (routePolyline && routePolyline.length > 0) || routeSegments.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
      }

      setTimeout(() => {
        if (isMounted && mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 250);
    }

    initMap().catch((error: unknown) => {
      console.error('No se pudo inicializar el mapa de Leaflet:', error);
      if (isMounted) {
        setMapError('No se pudo cargar el mapa. Puedes abrir la ubicación en OpenStreetMap.');
      }
    });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.stop();
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (itineraryMarkersLayerRef.current === itineraryMarkersLayer) {
        itineraryMarkersLayerRef.current = null;
      }
      routeLayers.clear();
      if (routeLayersRef.current === routeLayers) {
        routeLayersRef.current = new Map();
      }
    };
  }, [place, nearby, routePolyline, routePlaces, hotelAnchor, routeSegments]);

  useEffect(() => {
    const mapElement = mapContainerRef.current;
    const map = mapInstanceRef.current;
    if (!mapElement || !map) return;

    const selectedClass = selectedLegId ? `map-route-leg-${selectedLegId}` : null;
    mapElement.querySelectorAll<HTMLElement>('[class*="map-route-leg-"]').forEach((element) => {
      element.classList.toggle(
        'map-route-muted',
        Boolean(selectedClass && !element.classList.contains(selectedClass))
      );
    });

    if (!selectedLegId) return;
    const selectedCoordinates = routeSegments
      .filter((segment) => segment.legId === selectedLegId)
      .flatMap((segment) => segment.coordinates);
    if (selectedCoordinates.length < 2) return;

    import('leaflet').then((L) => {
      if (mapInstanceRef.current !== map) return;
      map.fitBounds(L.latLngBounds(selectedCoordinates), {
        padding: [64, 64],
        maxZoom: 17,
        animate: true,
      });
    });
  }, [selectedLegId, routeSegments]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const markers = itineraryMarkersLayerRef.current;
    if (!map || !markers) return;
    if (showItineraryMarkers) markers.addTo(map);
    else map.removeLayer(markers);
  }, [showItineraryMarkers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    routeLayersRef.current.forEach((layer, key) => {
      if (hiddenRouteKeys.has(key)) map.removeLayer(layer);
      else layer.addTo(map);
    });
  }, [hiddenRouteKeys]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapInstanceRef.current?.invalidateSize({ pan: false });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [isExpanded]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        mapInstanceRef.current?.invalidateSize({ pan: false });
      });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!isExpanded) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    document.addEventListener('keydown', closeWithEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeWithEscape);
      document.body.style.overflow = '';
    };
  }, [isExpanded]);

  const mapContent = (
    <div className={isExpanded ? 'flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-adobe-border bg-white shadow-2xl' : 'w-full'}>
      <div className="flex items-center justify-between border-b border-adobe-border bg-white px-3 py-2">
        <span className="text-xs font-bold text-adobe-dark">Mapa y recorrido</span>
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="rounded-lg border border-adobe-border px-2.5 py-1 text-xs font-bold text-adobe-dark transition hover:bg-adobe-bg"
          aria-label={isExpanded ? 'Cerrar mapa ampliado' : 'Ampliar mapa'}
        >
          {isExpanded ? 'Cerrar mapa' : 'Ampliar mapa'}
        </button>
      </div>
      <div
        ref={mapContainerRef}
        className={
          isExpanded
            ? 'min-h-0 flex-1 w-full'
            : 'h-80 w-full sm:h-96'
        }
      />
    </div>
  );

  const mapPanel = (
    <div
      className={
        `map-shell ${isExpanded ? 'map-shell-expanded' : ''} ${
        showItineraryMarkers ? '' : 'itinerary-markers-hidden'
        } ${simplified ? 'map-shell-simplified' : ''} ${
        isExpanded
          ? 'fixed inset-0 z-[1200] bg-black/45'
          : 'relative z-0 isolate w-full overflow-hidden rounded-2xl border border-adobe-border'
        }`
      }
    >
      {mapContent}
      {routeOptions.length > 0 && (
        <>
          <button
            type="button"
            className="map-route-legend-toggle absolute bottom-3 left-3 z-[1000] rounded-xl border border-white/80 bg-white/95 px-3 py-2 text-[11px] font-bold text-adobe-dark shadow-lg"
            aria-expanded={isLegendOpen}
            onClick={() => setIsLegendOpen((open) => !open)}
          >
            {isLegendOpen ? 'Ocultar legs' : `Legs del itinerario (${routeOptions.length})`}
          </button>
          {isLegendOpen && (
        <div className="map-route-controls absolute bottom-14 left-3 z-[1000] max-w-[min(92%,420px)] rounded-xl border border-white/80 bg-white/95 px-3 py-2 text-[11px] shadow-lg">
          <div className="mb-1 font-bold text-adobe-dark">Mostrar u ocultar un tramo</div>
          <div className="map-route-options">
            <label className="map-route-option">
              <input
                type="checkbox"
                checked={showItineraryMarkers}
                onChange={() => setShowItineraryMarkers((visible) => !visible)}
                aria-label={`${showItineraryMarkers ? 'Ocultar' : 'Mostrar'} números de paradas`}
              />
              <span className="map-route-swatch map-route-stop-swatch" aria-hidden="true">1</span>
              <span className="map-route-option-label">
                <strong>Paradas</strong>
                <span>Números del itinerario</span>
              </span>
            </label>
            {routeOptions.map((route, index) => {
              const isVisible = !hiddenRouteKeys.has(route.key);
              return (
                <label
                  key={route.key}
                  className={`map-route-option ${isVisible ? '' : 'is-hidden'}`}
                  title={`${isVisible ? 'Ocultar' : 'Mostrar'} ${route.label}`}
                >
                  <input
                    type="checkbox"
                    checked={isVisible}
                    onChange={() => toggleRoute(route.key)}
                    aria-label={`${isVisible ? 'Ocultar' : 'Mostrar'} tramo ${index + 1}: ${route.label}`}
                  />
                  <span
                    className="map-route-swatch"
                    style={{ background: route.routeColor ?? '#D97706' }}
                    aria-hidden="true"
                  />
                  <span className="map-route-option-label">
                    <strong>{route.legId ? `Leg ${route.legId}` : route.tripLabel || `Trayecto ${index + 1}`}</strong>
                    <span>
                      {route.estimatedMinutes != null
                      ? `${route.isTransit ? 'bus' : 'a pie'} ~${route.estimatedMinutes} min · `
                        : ''}
                      {route.farePen != null
                        ? route.fareRangePen
                          ? `S/ ${route.fareRangePen[0].toFixed(2)}–${route.fareRangePen[1].toFixed(2)} · `
                          : `S/ ${route.farePen.toFixed(2)} · `
                        : ''}
                    {route.label}{route.isTransit ? ' · trazo aproximado' : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
          )}
        </>
      )}
      {mapError && (
        <div className="absolute left-3 top-14 z-[1000] max-w-xs rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-900 shadow">
          {mapError} Las líneas de recorrido siguen disponibles cuando hay coordenadas.
        </div>
      )}
    </div>
  );

  return mapPanel;
}
