"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, Compass, Hotel, Landmark, Search, Utensils } from "lucide-react";
import type { Place, PlaceKind } from "@/lib/types";

interface PlacesCatalogClientProps {
  places: Place[];
}

type CategoryFilter = "all" | PlaceKind;
type ZoneFilter = "all" | "costa" | "valle" | "sierra";

function getPlaceZone(place: Place): Exclude<ZoneFilter, "all"> {
  const name = place.name.toLowerCase();
  if (
    place.coast_type === "coastal" ||
    name.includes("huanchaco") ||
    name.includes("chicama") ||
    name.includes("malabrigo")
  ) {
    return "costa";
  }
  if (place.lat < -7.7 && place.lon > -78.5) return "sierra";
  return "valle";
}

function getKindLabel(kind: PlaceKind): string {
  switch (kind) {
    case "attraction":
      return "Atractivo";
    case "lodging":
      return "Hospedaje";
    case "food":
      return "Restaurante";
    case "activity":
      return "Actividad";
    default:
      return "Otro lugar";
  }
}

function getKindStyles(kind: PlaceKind): string {
  switch (kind) {
    case "attraction":
      return "border-moche-200 bg-moche-50 text-moche-700";
    case "lodging":
      return "border-indigo-200 bg-indigo-50 text-indigo-800";
    case "food":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "activity":
      return "border-teal-200 bg-teal-50 text-teal-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getFallbackImage(kind: PlaceKind): string {
  switch (kind) {
    case "lodging":
      return "/images/defaults/default_lodging.webp";
    case "food":
      return "/images/defaults/default_food.webp";
    case "activity":
      return "/images/defaults/default_activity.webp";
    default:
      return "/images/defaults/default_attraction.webp";
  }
}

export function PlacesCatalogClient({ places }: PlacesCatalogClientProps) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [zone, setZone] = useState<ZoneFilter>("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(
    () => ({
      all: places.length,
      attraction: places.filter((place) => place.kind === "attraction").length,
      lodging: places.filter((place) => place.kind === "lodging").length,
      food: places.filter((place) => place.kind === "food").length,
      activity: places.filter((place) => place.kind === "activity").length,
      unclassified: places.filter((place) => place.kind === "unclassified").length,
    }),
    [places]
  );

  const filteredPlaces = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return places
      .filter((place) => {
        if (category !== "all" && place.kind !== category) return false;
        if (zone !== "all" && getPlaceZone(place) !== zone) return false;
        if (!query) return true;
        return [place.name, place.address, place.cuisine]
          .some((value) => value?.toLocaleLowerCase("es").includes(query));
      })
      .sort((a, b) => {
        const reviews = (b.user_rating_count ?? 0) - (a.user_rating_count ?? 0);
        if (reviews !== 0) return reviews;
        const stars = (b.stars ?? 0) - (a.stars ?? 0);
        if (stars !== 0) return stars;
        return (b.score ?? 0) - (a.score ?? 0);
      });
  }, [places, category, zone, search]);

  const categories: { id: CategoryFilter; label: string; icon: typeof Landmark }[] = [
    { id: "all", label: "Todos", icon: Compass },
    { id: "attraction", label: "Atractivos", icon: Landmark },
    { id: "lodging", label: "Hospedajes", icon: Hotel },
    { id: "food", label: "Restaurantes", icon: Utensils },
    { id: "activity", label: "Actividades", icon: Activity },
    { id: "unclassified", label: "Otros", icon: Landmark },
  ];

  return (
    <section aria-label="Catálogo de lugares" className="space-y-5">
      <div className="rounded-2xl border border-adobe-border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" aria-label="Filtrar por categoría">
            {categories.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  category === id
                    ? "border-moche-600 bg-moche-600 text-white"
                    : "border-adobe-border bg-adobe-bg text-adobe-muted hover:border-moche-300 hover:text-moche-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label} ({counts[id]})
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <span className="sr-only">Buscar lugares</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adobe-muted" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre, dirección o gastronomía..."
                className="w-full rounded-xl border border-adobe-border bg-adobe-bg/50 py-2.5 pl-9 pr-3 text-sm text-adobe-dark outline-none transition placeholder:text-adobe-muted focus:border-moche-400 focus:bg-white focus:ring-2 focus:ring-moche-100"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-adobe-muted">
              Zona
              <select
                value={zone}
                onChange={(event) => setZone(event.target.value as ZoneFilter)}
                className="min-h-10 rounded-xl border border-adobe-border bg-white px-3 text-xs font-semibold text-adobe-dark outline-none focus:border-moche-400 focus:ring-2 focus:ring-moche-100"
              >
                <option value="all">Toda la región</option>
                <option value="costa">Costa</option>
                <option value="valle">Valle Moche</option>
                <option value="sierra">Sierra</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <p className="text-xs font-semibold text-adobe-muted" aria-live="polite">
        {filteredPlaces.length} {filteredPlaces.length === 1 ? "lugar encontrado" : "lugares encontrados"}
      </p>

      {filteredPlaces.length === 0 ? (
        <div className="rounded-2xl border border-adobe-border bg-white p-10 text-center text-sm text-adobe-muted">
          No se encontraron lugares con esos filtros.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredPlaces.map((place) => {
            const fallback = getFallbackImage(place.kind);
            const image =
              place.image_url && !place.image_url.includes("google")
                ? place.image_url
                : `/images/places/place_${place.id}.webp`;

            return (
              <article
                key={place.id}
                className="flex min-w-0 flex-col gap-3 rounded-2xl border border-adobe-border bg-white p-3.5 transition hover:border-moche-300 hover:shadow-sm sm:flex-row sm:items-center sm:p-4"
              >
                <Image
                  src={image}
                  alt=""
                  width={320}
                  height={240}
                  loading="lazy"
                  unoptimized
                  className="h-24 w-full shrink-0 rounded-xl border border-adobe-border/60 bg-neutral-100 object-cover sm:h-20 sm:w-20"
                  onError={(event) => {
                    event.currentTarget.src = fallback;
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-sm font-bold text-adobe-dark">
                      <Link href={`/places/${place.id}`} className="hover:text-moche-700">
                        {place.name}
                      </Link>
                    </h2>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${getKindStyles(place.kind)}`}>
                      {getKindLabel(place.kind)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-adobe-muted">
                    {place.address || "La Libertad, Perú"}
                    {place.cuisine ? ` · Cocina ${place.cuisine}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-adobe-muted">
                    {place.stars != null ? (
                      <span className="font-semibold text-amber-700">
                        ★ {place.stars.toFixed(1)}
                        {place.user_rating_count ? ` (${place.user_rating_count})` : ""}
                      </span>
                    ) : (
                      <span className="font-semibold text-emerald-700">✓ Verificado</span>
                    )}
                    {place.phone && <span>Tel: {place.phone}</span>}
                    {place.safety_score != null && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800">
                        Seguridad: {Math.round(place.safety_score)}/100
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/places/${place.id}`}
                  className="shrink-0 rounded-xl border border-adobe-border px-3 py-2 text-center text-xs font-bold text-adobe-dark transition hover:border-moche-300 hover:bg-moche-50 hover:text-moche-700"
                >
                  Ver detalle
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
