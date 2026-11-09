'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type { LayerGroup, Map as LeafletMap, Marker } from 'leaflet';
import { LocateFixed, MapPinned } from 'lucide-react';
import type { NearbyPlace, Place, PlaceDetail } from '@/lib/types';

export interface MapRouteSegment {
  routeId?: string;
  kind: 'walking' | 'transit' | 'driving';
  coordinates: [number, number][];
  label: string;
  distanceKm?: number;
  routeColor?: string;
  routeCode?: string;
  companyName?: string;
  badgeColor?: string;
  textColor?: string;
  vehicleType?: 'micro' | 'combi' | 'bus' | 'colectivo' | 'mototaxi' | 'taxi';
  legId?: string;
  tripLabel?: string;
  estimatedMinutes?: number;
  waitMinutes?: number;
  farePen?: number;
  fareRangePen?: [number, number];
  vehicleImageUrl?: string;
  boardingStop?: string;
  dropoffStop?: string;
  boardingLandmarkHint?: string;
  dropoffLandmarkHint?: string;
  routeGeometryVerified?: boolean;
  walkPhase?: 'to-board' | 'transfer' | 'to-place';
  isApproximate?: boolean;
}

interface PlaceMapProps {
  place: PlaceDetail;
  nearby?: NearbyPlace[];
  routePolyline?: [number, number][];
  routePlaces?: Place[];
  selectedPlace?: Place | null;
  hotelAnchor?: Place | null;
  routeSegments?: MapRouteSegment[];
  selectedLegId?: string | null;
  onSelectLeg?: (legId: string) => void;
  onSelectTransitRoute?: (segment: MapRouteSegment) => void;
  onSelectPlace?: (place: Place) => void;
  simplified?: boolean;
}

export default function PlaceMap({
  place,
  nearby = [],
  routePolyline = [],
  routePlaces = [],
  selectedPlace = null,
  hotelAnchor = null,
  routeSegments = [],
  selectedLegId = null,
  onSelectLeg,
  onSelectTransitRoute,
  onSelectPlace,
  simplified = false,
}: PlaceMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const routeLayersRef = useRef<Map<string, LayerGroup>>(new Map());
  const placeMarkersRef = useRef<Map<number, Marker>>(new Map());
  const initialMapViewRef = useRef<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const itineraryMarkersLayerRef = useRef<LayerGroup | null>(null);
  const onSelectLegRef = useRef(onSelectLeg);
  const onSelectTransitRouteRef = useRef(onSelectTransitRoute);
  const onSelectPlaceRef = useRef(onSelectPlace);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    onSelectLegRef.current = onSelectLeg;
  }, [onSelectLeg]);

  useEffect(() => {
    onSelectTransitRouteRef.current = onSelectTransitRoute;
  }, [onSelectTransitRoute]);

  useEffect(() => {
    onSelectPlaceRef.current = onSelectPlace;
  }, [onSelectPlace]);
  useEffect(() => {
    let isMounted = true;
    const routeLayers = new Map<string, LayerGroup>();
    const placeMarkers = placeMarkersRef.current;
    let itineraryMarkersLayer: LayerGroup | null = null;

    async function initMap() {
      setMapError(null);
      setMapReady(false);
      placeMarkers.clear();
      initialMapViewRef.current = null;
      if (!mapContainerRef.current) return;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const L = await import('leaflet');
      const createWalkingMarker = (
        coords: [number, number][],
        distanceMeters: number,
        durationMinutes: number,
        legId?: string
      ) => {
        if (coords.length < 2) return null;

        const lengths = coords.slice(1).map((point, pointIndex) =>
          L.latLng(coords[pointIndex][0], coords[pointIndex][1])
            .distanceTo(L.latLng(point[0], point[1]))
        );
        const halfway = lengths.reduce((total, length) => total + length, 0) / 2;
        let traversed = 0;
        let midpoint = coords[0];
        for (let pointIndex = 0; pointIndex < lengths.length; pointIndex += 1) {
          if (traversed + lengths[pointIndex] >= halfway) {
            const fraction = lengths[pointIndex] > 0
              ? (halfway - traversed) / lengths[pointIndex]
              : 0;
            const start = coords[pointIndex];
            const end = coords[pointIndex + 1];
            midpoint = [
              start[0] + (end[0] - start[0]) * fraction,
              start[1] + (end[1] - start[1]) * fraction,
            ];
            break;
          }
          traversed += lengths[pointIndex];
        }

        const icon = L.divIcon({
          className: `map-walk-marker map-route-leg-${legId ?? 'other'}`,
          html: `<div style="display:flex;align-items:center;gap:5px;width:max-content;padding:6px 8px;border:1px solid #e2e8f0;border-radius:9999px;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.18);color:#334155;transition:opacity 140ms ease">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="m10 22 2-7-3-3 2-5 4 3 3 1M9 12l-4 3-2 4M14 15l4 2 2 4"/></svg>
            <span style="font:600 10px/1 ui-sans-serif,system-ui,sans-serif;white-space:nowrap">${distanceMeters} m · ${durationMinutes} min</span>
          </div>`,
          iconSize: [130, 32],
          iconAnchor: [65, 16],
        });
        const marker = L.marker(midpoint, {
          icon,
          keyboard: true,
          title: `Caminata${legId ? ` del tramo ${legId}` : ''}: ${distanceMeters} m, ${durationMinutes} min`,
          alt: `Caminata: ${distanceMeters} metros, ${durationMinutes} minutos`,
          zIndexOffset: 500,
        });
        marker.on('click', () => {
          if (legId) onSelectLegRef.current?.(legId);
        });
        return marker;
      };

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
            keyboard: true,
            title: place.name,
            alt: `Ver información de ${place.name}`,
          }).addTo(map);
      if (mainMarker) {
        placeMarkers.set(place.id, mainMarker);
        mainMarker.on('click', () => onSelectPlaceRef.current?.(place));
      }

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
          keyboard: true,
          title: np.name,
          alt: `Ver información de ${np.name}`,
        }).addTo(map);
        placeMarkers.set(np.id, m);
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
        const hotelMarker = L.marker([hotelAnchor.lat, hotelAnchor.lon], {
          icon: hotelIcon,
          keyboard: true,
          title: hotelAnchor.name,
          alt: `Ver información de ${hotelAnchor.name}`,
        }).addTo(map);
        placeMarkers.set(hotelAnchor.id, hotelMarker);
        hotelMarker.on('click', () => onSelectPlaceRef.current?.(hotelAnchor));
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

            const routePlaceMarker = L.marker([rp.lat, rp.lon], {
              icon: orderIcon,
              keyboard: true,
              zIndexOffset: 1000,
              title: rp.name,
              alt: `Ver información de ${rp.name}`,
            })
              .addTo(markersLayer);
            placeMarkers.set(rp.id, routePlaceMarker);
            routePlaceMarker.on('click', () => {
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
                ? segment.badgeColor ?? segment.routeColor ?? '#D97706'
                : '#64748B';
          const legClass = `map-route-leg-${segment.legId ?? 'other'}`;
          const routeIsVerified =
            segment.kind !== 'transit' ||
            (segment.routeGeometryVerified === true && !segment.isApproximate);
          L.polyline(segment.coordinates, {
            color: '#fff',
            weight: segment.kind === 'transit' ? 8 : 6,
            opacity: 0.85,
            dashArray: segment.kind === 'walking'
              ? '4 7'
              : !routeIsVerified || segment.isApproximate
                ? '6 7'
                : undefined,
            className: `map-route-casing ${legClass}`,
            lineJoin: 'round',
          }).addTo(routeLayer);
          const line = L.polyline(segment.coordinates, {
            color,
            weight: segment.kind === 'transit' ? 4 : 3,
            opacity: 0.9,
            dashArray: segment.kind === 'walking'
              ? '4 7'
              : !routeIsVerified || segment.isApproximate
                ? '6 7'
                : undefined,
            className: `map-route-line map-route-${segment.kind} ${legClass}`,
            lineJoin: 'round',
          }).addTo(routeLayer);
          if (segment.kind === 'transit') {
            line.on('click', () => {
              onSelectTransitRouteRef.current?.(segment);
            });
          }
          const routeTooltip = document.createElement('div');
          routeTooltip.className = 'flex flex-col gap-1';
          if (segment.kind === 'transit') {
            const badge = document.createElement('span');
            badge.textContent = segment.vehicleType === 'taxi'
              ? 'Taxi / aplicativo'
              : `${segment.routeCode ?? segment.label.split(':')[0]} · ${segment.companyName ?? 'Transporte público'}`;
            badge.style.cssText =
              `display:inline-block;width:fit-content;padding:2px 7px;border-radius:999px;font-weight:800;background:${segment.badgeColor ?? color};color:${segment.textColor ?? '#fff'}`;
            routeTooltip.appendChild(badge);
          }
          const routeDescription = document.createElement('span');
          routeDescription.textContent = `${segment.label}${segment.distanceKm != null ? ` · ${segment.distanceKm.toFixed(1)} km` : ''}`;
          routeTooltip.appendChild(routeDescription);
          line.bindTooltip(routeTooltip, { sticky: true });
          if (segment.kind === 'walking' && segment.coordinates.length > 1) {
            const distanceMeters = Math.round((segment.distanceKm ?? 0) * 1000);
            const durationMinutes = segment.estimatedMinutes ?? 0;
            createWalkingMarker(
              segment.coordinates,
              distanceMeters,
              durationMinutes,
              segment.legId
            )?.addTo(routeLayer);
          }
          if (segment.kind === 'transit' && segment.estimatedMinutes != null) {
            const midpoint =
              segment.coordinates[Math.floor(segment.coordinates.length / 2)];
            const durationIcon = L.divIcon({
              className: `map-route-duration-pin ${legClass}`,
              html: `<span title="Tiempo estimado${segment.waitMinutes ? `; incluye ${segment.waitMinutes} min de espera` : ''}">Leg ${segment.legId ?? '?'} · ~${segment.estimatedMinutes + (segment.waitMinutes ?? 0)} min</span>`,
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
          const endpointIcon = (action: string): HTMLElement => {
            const container = document.createElement('div');
            container.className = 'route-endpoint-pin-content';
            const label = document.createElement('span');
            if (segment.vehicleType === 'taxi') {
              label.textContent = `🚕 ${action === 'Sube' ? 'Punto de recojo' : 'Destino'}`;
              label.style.cssText =
                'display:inline-flex;align-items:center;justify-content:center;padding:5px 8px;border-radius:999px;background:#A16207;color:#fff;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 2px 6px rgb(15 23 42 / 35%)';
              container.append(label);
            } else {
              const badge = document.createElement('span');
              badge.textContent = segment.routeCode ?? segment.legId ?? '';
              badge.style.cssText =
                `display:inline-flex;align-items:center;justify-content:center;min-width:24px;padding:2px 5px;border-radius:999px;background:${segment.badgeColor ?? color};color:${segment.textColor ?? '#fff'};font-size:10px;font-weight:800`;
              label.textContent = `🚌 ${action}`;
              container.append(badge, label);
            }
            return container;
          };
          const collidesWithPlaceMarker = (point: [number, number]) =>
            routePlaces.some(
              (routePlace) =>
                Math.abs(routePlace.lat - point[0]) < 0.00015 &&
                Math.abs(routePlace.lon - point[1]) < 0.00015
            );
          const endpointIconForLeaflet = (
            action: string,
            point: [number, number]
          ) => {
            const isTaxi = segment.vehicleType === 'taxi';
            const iconSize: [number, number] = isTaxi ? [132, 32] : [88, 30];
            return L.divIcon({
              className: `route-endpoint-pin ${legClass}`,
              html: endpointIcon(action),
              iconSize,
              iconAnchor: [
                iconSize[0] / 2,
                collidesWithPlaceMarker(point) ? iconSize[1] + 37 : iconSize[1] + 13,
              ],
            });
          };
          if (segment.kind === 'transit') {
            const boardingMarker = L.marker(start, {
              icon: endpointIconForLeaflet('Sube', start),
              zIndexOffset: 700,
            }).addTo(routeLayer);
            const boardingTooltip = document.createElement('div');
            const boardingTitle = document.createElement('strong');
            boardingTitle.textContent = segment.vehicleType === 'taxi'
              ? 'Punto de recojo'
              : `Sube: ${segment.companyName ?? 'transporte público'}${segment.routeCode ? ` · Línea ${segment.routeCode}` : ''}`;
            const boardingLocation = document.createElement('div');
            const boardingStop = segment.boardingStop ?? (segment.vehicleType === 'taxi' ? 'Punto de partida' : 'Paradero sugerido');
            const boardingHint =
              segment.boardingLandmarkHint &&
              segment.boardingLandmarkHint !== boardingStop
                ? segment.boardingLandmarkHint
                : undefined;
            boardingLocation.textContent = [boardingStop, boardingHint]
              .filter(Boolean)
              .join(' · ');
            boardingTooltip.append(boardingTitle, boardingLocation);
            boardingMarker
              .bindTooltip(boardingTooltip)
              .on('click', () => {
                onSelectTransitRouteRef.current?.(segment);
              });
            const dropoffMarker = L.marker(end, {
              icon: endpointIconForLeaflet('Baja', end),
              zIndexOffset: 700,
            }).addTo(routeLayer);
            const dropoffTooltip = document.createElement('div');
            const dropoffTitle = document.createElement('strong');
            dropoffTitle.textContent = segment.vehicleType === 'taxi'
              ? 'Destino'
              : `Baja en ${segment.dropoffStop ?? 'paradero sugerido'}`;
            const dropoffLocation = document.createElement('div');
            const dropoffHint =
              segment.dropoffLandmarkHint &&
              segment.dropoffLandmarkHint !== segment.dropoffStop
                ? segment.dropoffLandmarkHint
                : undefined;
            if (dropoffHint) {
              dropoffLocation.textContent = dropoffHint;
              dropoffTooltip.append(dropoffTitle, dropoffLocation);
            } else {
              dropoffTooltip.append(dropoffTitle);
            }
            dropoffMarker
              .bindTooltip(dropoffTooltip)
              .on('click', () => {
                onSelectTransitRouteRef.current?.(segment);
              });
          }
          segment.coordinates.forEach(([lat, lon]) => bounds.extend(L.latLng(lat, lon)));
        });
        routeLayers.forEach((layer) => layer.addTo(map));
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
      const initialCenter = map.getCenter();
      initialMapViewRef.current = {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: map.getZoom(),
      };
      setMapReady(true);

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
      placeMarkers.clear();
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
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    let selectedMarker: Marker | undefined;
    placeMarkersRef.current.forEach((marker, placeId) => {
      const isSelected = placeId === selectedPlace?.id;
      marker.getElement()?.classList.toggle('map-place-focused', isSelected);
      if (isSelected) selectedMarker = marker;
    });

    if (selectedPlace && selectedMarker) {
      map.flyTo(selectedMarker.getLatLng(), Math.max(map.getZoom(), 15.4), {
        animate: true,
        duration: 0.6,
      });
    }
  }, [selectedPlace, mapReady]);

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

  const fitActiveItinerary = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const coordinates = [
      ...routePlaces
        .filter((routePlace) => Number.isFinite(routePlace.lat) && Number.isFinite(routePlace.lon))
        .map((routePlace) => [routePlace.lat, routePlace.lon] as [number, number]),
      ...routeSegments.flatMap((segment) =>
        segment.coordinates.filter(
          ([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)
        )
      ),
    ];
    if (coordinates.length === 0) return;
    if (coordinates.length === 1) {
      map.flyTo(coordinates[0], Math.max(map.getZoom(), 15), {
        animate: true,
        duration: 0.6,
      });
      return;
    }

    map.fitBounds(coordinates, {
      padding: [56, 56],
      maxZoom: 16,
      animate: true,
      duration: 0.6,
    });
  };

  const restoreInitialMapView = () => {
    const map = mapInstanceRef.current;
    const initialView = initialMapViewRef.current;
    if (!map || !initialView) return;
    map.flyTo(initialView.center, initialView.zoom, {
      animate: true,
      duration: 0.6,
    });
  };

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
    <div className={isExpanded ? 'relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-adobe-border bg-white shadow-2xl' : 'relative w-full'}>
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
      {mapReady && (
        <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-1.5">
            {routePlaces.length > 0 || routeSegments.length > 0 ? (
              <button
                type="button"
                onClick={fitActiveItinerary}
                className="inline-flex items-center gap-1.5 rounded-lg border border-adobe-border bg-white/95 px-2.5 py-2 text-[11px] font-bold text-adobe-dark shadow-md transition hover:bg-white"
                title="Encuadrar las paradas y tramos del día activo"
                aria-label="Encuadrar el itinerario del día activo"
              >
                <LocateFixed className="h-3.5 w-3.5 text-moche-700" />
                Itinerario
              </button>
            ) : null}
            <button
              type="button"
              onClick={restoreInitialMapView}
              className="inline-flex items-center gap-1.5 rounded-lg border border-adobe-border bg-white/95 px-2.5 py-2 text-[11px] font-bold text-adobe-dark shadow-md transition hover:bg-white"
              title="Volver a la vista general inicial del mapa"
              aria-label="Volver a la vista general del mapa"
            >
              <MapPinned className="h-3.5 w-3.5 text-adobe-muted" />
              Vista general
            </button>
        </div>
      )}
    </div>
  );

  const mapPanel = (
    <div
      className={
        `map-shell ${isExpanded ? 'map-shell-expanded' : ''} ${
        simplified ? 'map-shell-simplified' : ''} ${
        isExpanded
          ? 'fixed inset-0 z-[1200] bg-black/45'
          : 'relative z-0 isolate w-full overflow-hidden rounded-2xl border border-adobe-border'
        }`
      }
    >
      {mapContent}
      {mapError && (
        <div className="absolute left-3 top-14 z-[1000] max-w-xs rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-900 shadow">
          {mapError} Las líneas de recorrido siguen disponibles cuando hay coordenadas.
        </div>
      )}
    </div>
  );

  return mapPanel;
}
