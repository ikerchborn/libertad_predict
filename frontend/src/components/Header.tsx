"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Compass,
  Eye,
  EyeOff,
  FolderKanban,
  MapPin,
  Pencil,
  Plus,
} from "lucide-react";

interface HeaderProps {
  onOpenTrips?: () => void;
  onCreateTrip?: () => void;
  onExplorePlaces?: () => void;
  savedTripsCount?: number;
  showNavigation?: boolean;
  planner?: {
    title: string;
    destination: string;
    dateRange: string;
    dayCount: number;
    nightCount: number;
    mapVisible: boolean;
  };
  onRenameTrip?: (title: string) => void;
  onEditTripDates?: () => void;
  onToggleMap?: () => void;
}

export function Header({
  onOpenTrips,
  onCreateTrip,
  onExplorePlaces,
  savedTripsCount,
  showNavigation = false,
  planner,
  onRenameTrip,
  onEditTripDates,
  onToggleMap,
}: HeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  return (
    <>
      <header
        id={planner ? "planner-summary" : undefined}
        className="libertad-header fixed top-0 left-0 right-0 z-[100] border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs"
      >
      <div
        className={`${planner ? "planner-header-inner " : ""}mx-auto flex min-h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6 ${
          planner ? "flex-wrap justify-between py-2 xl:flex-nowrap" : "justify-between"
        }`}
      >
        <Link
          href="/"
          className={`${planner ? "planner-header-brand " : ""}flex shrink-0 items-center gap-2.5`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Compass className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-slate-900 max-sm:hidden">
            Libertad<span className="text-orange-600">GO</span>
          </span>
        </Link>

        {planner && <span className="planner-header-divider h-7 w-px shrink-0 bg-slate-200" aria-hidden="true" />}

        {planner && (
          <div className="planner-header-details flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            {isEditingTitle ? (
              <form
                className="flex min-w-0 items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const title = titleDraft.trim();
                  if (title) onRenameTrip?.(title);
                  setIsEditingTitle(false);
                }}
              >
                <input
                  autoFocus
                  aria-label="Nombre del viaje"
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  className="w-36 rounded-md border border-orange-300 px-2 py-1 text-xs font-bold outline-none focus:ring-2 focus:ring-orange-200 sm:w-44"
                />
                <button type="submit" className="text-xs font-bold text-orange-700">OK</button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className="text-xs text-slate-500"
                  aria-label="Cancelar edición del nombre"
                >
                  ×
                </button>
              </form>
            ) : (
              <div className="flex min-w-0 items-center gap-1">
                <span className="max-w-40 truncate text-xs font-extrabold text-slate-800 sm:max-w-56">
                  {planner.title}
                </span>
                <button
                  type="button"
                  aria-label="Editar nombre del viaje"
                  title="Editar nombre del viaje"
                  onClick={() => {
                    setTitleDraft(planner.title);
                    setIsEditingTitle(true);
                  }}
                  className="rounded p-1 text-slate-500 hover:bg-orange-50 hover:text-orange-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
              <MapPin className="h-3.5 w-3.5 text-orange-600" />
              {planner.destination}
            </span>

            <button
              type="button"
              onClick={onEditTripDates}
              title="Modificar fechas del viaje"
              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-orange-700"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{planner.dateRange}</span>
            </button>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
              {planner.dayCount} d / {planner.nightCount} n
            </span>
          </div>
        )}

        {!planner && showNavigation && (
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
            <a className="transition hover:text-orange-600" href="#planner-summary">
              Resumen
            </a>
            <Link className="transition hover:text-orange-600" href="/places">
              Lugares
            </Link>
            <a className="transition hover:text-orange-600" href="#planner-itinerary">
              Itinerario
            </a>
          </nav>
        )}

        <div className={`${planner ? "planner-header-actions " : ""}flex shrink-0 items-center gap-2`}>
          {planner && onToggleMap && (
            <button
              type="button"
              onClick={onToggleMap}
              aria-pressed={!planner.mapVisible}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50"
            >
              {planner.mapVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="hidden sm:inline">{planner.mapVisible ? "Ocultar mapa" : "Mostrar mapa"}</span>
            </button>
          )}

          {planner && onExplorePlaces && (
            <button
              type="button"
              onClick={onExplorePlaces}
              title="Explorar más lugares"
              aria-label="Explorar más lugares"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50"
            >
              <Plus className="h-4 w-4" />
              <span>Lugares</span>
            </button>
          )}

          {onOpenTrips && (
            <button
              type="button"
              onClick={onOpenTrips}
              title="Ver mis viajes guardados"
              aria-label={`Mis viajes (${savedTripsCount ?? 0})`}
              className="relative inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 sm:px-3"
            >
              <FolderKanban className="h-4 w-4" />
              <span className={`text-xs font-bold ${planner ? "hidden" : "hidden sm:inline"}`}>Mis viajes</span>
              {savedTripsCount != null && savedTripsCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[9px] font-extrabold text-white">
                  {savedTripsCount}
                </span>
              )}
            </button>
          )}
          {onCreateTrip && (
            <button
              type="button"
              onClick={onCreateTrip}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-orange-600 px-3 text-xs font-bold text-white transition hover:bg-orange-700"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{planner ? "Nuevo Viaje" : "Crear viaje"}</span>
            </button>
          )}
        </div>
      </div>
    </header>
    <div className={planner ? "h-15 sm:h-24 xl:h-14 shrink-0" : "h-14 shrink-0"} aria-hidden="true" />
  </>);
}
