"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Calendar as CalendarIcon,
  Clock,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Phone,
  Compass,
  Utensils,
  Hotel,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import PlaceMap from "@/components/PlaceMap";
import {
  CalendarDay,
  NearbyPlace,
  Place,
  PlaceDetail,
  PLACE_IMAGES,
  getHeatmapClassification,
} from "@/lib/types";
import { HeatmapCalendar } from "@/components/HeatmapCalendar";
import { FactorsTable } from "@/components/FactorsTable";
import PlaceSafetyModal from "@/components/PlaceSafetyModal";
import TripPlanner from "@/components/TripPlanner/TripPlanner";
import { useTripCache } from "@/hooks/useTripCache";
import { getLocalImageUrl, getSafeExternalUrl } from "@/lib/safeUrl";

interface PlaceDetailClientProps {
  place: PlaceDetail;
  calendarDays: CalendarDay[];
  initialDate: string;
  forecastFrom: string;
  forecastTo: string;
  nearbyLodging?: NearbyPlace[];
  nearbyFood?: NearbyPlace[];
}

export function PlaceDetailClient({
  place,
  calendarDays,
  initialDate,
  nearbyLodging = [],
  nearbyFood = [],
}: PlaceDetailClientProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [nearbyTab, setNearbyTab] = useState<"lodging" | "food">("lodging");
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const router = useRouter();
  const {
    activeDay: activeTripDay,
    isHydrated,
    trip,
    addPlaceToDay,
    setIsStarted,
  } = useTripCache();

  const activeDay =
    calendarDays.find((d) => d.date === selectedDate) ?? calendarDays[0];

  const imgInfo = PLACE_IMAGES[place.id];
  const localImage = getLocalImageUrl(place.image_url);
  const image =
    localImage &&
    !place.image_url?.includes("googleapis") &&
    !place.image_url?.includes("googleusercontent")
      ? localImage
      : `/images/places/place_${place.id}.webp`;
  const mapsUrl = getSafeExternalUrl(place.maps_url);
  const websiteUrl = getSafeExternalUrl(place.website);
  const description =
    imgInfo?.description ??
    (place.kind === "lodging"
      ? "Establecimiento de alojamiento en La Libertad con registro formal."
      : place.kind === "food"
      ? "Restaurante con oferta culinaria regional y tradicional de la costa norte."
      : "Destino turístico destacado de la región La Libertad con valores históricos, culturales y naturales verificados.");
  const bestTime = imgInfo?.bestTime ?? "9:00 AM - 1:00 PM";
  const displayedSafetyScore = place.safety_score;
  const displayedSafetyReport = place.safety_report;
  const activeDayNumber = activeTripDay
    ? trip.days.findIndex((day) => day.id === activeTripDay.id) + 1
    : 1;
  const safetyGuidance =
    displayedSafetyScore == null
      ? null
      : displayedSafetyScore >= 78
        ? "Zona generalmente tranquila para turistas durante el día."
        : displayedSafetyScore >= 60
            ? "Prefiere el horario de atención y las vías concurridas."
            : "Planifica la visita de día y verifica recomendaciones locales antes de salir.";

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-adobe-bg text-xs text-adobe-muted">
            Cargando información del viaje...
      </div>
    );
  }

  const addRecommendedPlace = (recommendedPlace: Place) => {
    if (!activeTripDay) return;
    addPlaceToDay(activeTripDay.id, recommendedPlace);
    setIsStarted(true);
    router.push("/");
  };

  const scoreVal =
    place.kind === "attraction"
      ? activeDay?.score ?? 50
      : place.recommendation_score ?? place.score ?? 50;
  const step = getHeatmapClassification(scoreVal);

  return (
    <div className="min-h-screen flex flex-col justify-between antialiased selection:bg-moche-500 selection:text-white bg-adobe-bg text-adobe-dark font-sans">
      <div>
        <Header />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-bold text-adobe-dark hover:text-moche-600 bg-white border border-adobe-border px-4 py-2 rounded-xl shadow-sm transition"
            >
              <ArrowLeft className="w-4 h-4 text-moche-600" />
              <span>Volver al Planificador</span>
            </Link>

            <span className="text-xs text-adobe-muted">Guía práctica para tu visita</span>
          </div>

          {/* Destination Hero Card */}
          <section className="bg-white rounded-2xl border border-adobe-border overflow-hidden shadow-xl shadow-moche-900/5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
              {/* Image banner */}
              <div className="lg:col-span-5 relative h-64 lg:h-auto min-h-[260px] bg-adobe-border overflow-hidden">
                <img
                  src={image}
                  alt={place.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `/images/defaults/default_${place.kind}.webp`;
                  }}
                />
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-moche-500" />
                  <span>
                    {place.address ||
                      (place.coast_type === "coastal"
                        ? "Costa Norte"
                        : "Valle Moche")}
                  </span>
                </div>
              </div>

              {/* Information body */}
              <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-6">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-moche-50 border border-moche-100 text-moche-700 text-xs font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                      {place.kind === "attraction"
                        ? "Atracción Turística"
                        : place.kind === "lodging"
                        ? "Hospedaje Oficial"
                        : place.kind === "food"
                        ? "Gastronomía"
                        : "Actividad Turística"}
                    </span>
                    <span className="bg-pacific-50 border border-pacific-100 text-pacific-800 text-xs font-semibold px-3 py-0.5 rounded-full">
                      {place.coast_type === "coastal"
                        ? "Zona Litoral"
                        : "Interior del Valle"}
                    </span>
                    {place.cuisine && (
                      <span className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-0.5 rounded-full">
                        {place.cuisine}
                      </span>
                    )}
                    {place.stars != null && (
                      <span className="bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold px-3 py-0.5 rounded-full">
                        ★ {place.stars.toFixed(1)}
                        {place.user_rating_count ? ` (${place.user_rating_count} reseñas Google)` : ""}
                      </span>
                    )}
                    {displayedSafetyScore != null && (
                      <button
                        type="button"
                        onClick={() => setIsSafetyModalOpen(true)}
                        className="inline-flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold px-3 py-0.5 rounded-full transition cursor-pointer"
                        title="Ver recomendaciones de tranquilidad y seguridad para el viajero">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          {safetyGuidance}
                        </span>
                        <span className="text-[10px] text-emerald-600 underline ml-0.5">Ver consejos</span>
                      </button>
                    )}
                  </div>

                  <h1 className="text-2xl sm:text-4xl font-display font-extrabold text-adobe-dark leading-tight">
                    {place.name}
                  </h1>

                  <p className="text-sm text-adobe-muted leading-relaxed">
                    {description}
                  </p>

                  {/* Commercial Direct Links & Contact */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-adobe-bg border border-adobe-border hover:bg-adobe-border/60 text-adobe-dark px-3 py-1.5 rounded-lg transition"
                      >
                        <Compass className="w-3.5 h-3.5 text-moche-600" />
                        <span>Ver en Google Maps</span>
                        <ExternalLink className="w-3 h-3 text-adobe-muted" />
                      </a>
                    )}
                    {websiteUrl && (
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-pacific-50 border border-pacific-100 text-pacific-800 px-3 py-1.5 rounded-lg hover:bg-pacific-100 transition"
                      >
                        <span>Sitio Web Oficial</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {place.phone && (
                      <a
                        href={`tel:${place.phone}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 border border-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{place.phone}</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Show climate guidance for attractions and source ratings for businesses. */}
                <div className="bg-adobe-bg rounded-xl p-4 border border-adobe-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {place.kind === "attraction" ? (
                      <div className={`${step.badgeClass} rounded-2xl px-4 py-2 text-center shadow-sm`}>
                        <div className="font-display text-2xl font-extrabold leading-none">
                          {scoreVal >= 80 ? "Buen clima" : scoreVal >= 60 ? "Clima variable" : "Revisa el clima"}
                        </div>
                        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider">
                          {step.name}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-center text-amber-900 shadow-sm">
                        <div className="font-display text-xl font-extrabold leading-none">
                          {place.stars != null ? `★ ${place.stars.toFixed(1)} / 5` : "Sin valoración"}
                        </div>
                        <div className="mt-1 text-[10px] font-semibold">
                          {place.user_rating_count
                            ? `${place.user_rating_count} reseñas disponibles`
                            : "Reseñas no disponibles"}
                        </div>
                      </div>
                    )}
                    <div className="space-y-0.5 text-xs">
                      <div className="font-bold text-adobe-dark flex items-center gap-1.5">
                        <CalendarIcon className="w-3.5 h-3.5 text-moche-500" />
                        <span>
                          {place.kind === "attraction"
                            ? `Pronóstico consultado: ${selectedDate}`
                            : "Valoración externa del establecimiento"}
                        </span>
                      </div>
                      <div className="text-adobe-muted flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          {place.kind === "attraction"
                            ? "El clima no garantiza las condiciones del sitio"
                            : "La puntuación no garantiza la experiencia actual"}
                        </span>
                      </div>
                      <div className="text-[11px] text-adobe-muted">
                        {place.kind === "attraction"
                          ? "Revisa horarios y traslados antes de salir."
                          : "Consulta reseñas recientes y confirma precios directamente."}
                      </div>
                    </div>
                  </div>

                  {place.kind === "attraction" && (
                    <div className="text-xs border-t sm:border-t-0 sm:border-l border-adobe-border sm:pl-4 pt-2 sm:pt-0">
                      <span className="text-adobe-muted flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-moche-500" /> Horario sugerido:
                      </span>
                      <strong className="text-adobe-dark font-semibold block mt-0.5">
                        {bestTime}
                      </strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Attraction Exclusive: 16-Day Heatmap Calendar */}
          {place.kind === "attraction" && calendarDays.length > 0 && (
            <section className="bg-white rounded-2xl border border-adobe-border p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-adobe-border/60 pb-3 gap-1">
                <div>
                  <h2 className="text-lg font-display font-bold text-adobe-dark flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-moche-600" />
                    Calendario de Conveniencia de Visita (16 Días)
                  </h2>
                  <p className="text-xs text-adobe-muted">
                    Previsión meteorológica y conveniencia para planificar tu recorrido.
                  </p>
                </div>
                <span className="text-xs font-mono text-adobe-muted">
                  Semana Lu &ndash; Do
                </span>
              </div>

              <HeatmapCalendar
                days={calendarDays}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />
            </section>
          )}

          {/* Attraction Exclusive: Factors Breakdown Table */}
          {place.kind === "attraction" && activeDay && (
            <section className="bg-white rounded-2xl border border-adobe-border p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between border-b border-adobe-border/60 pb-3 gap-1">
                <div>
                  <h2 className="text-lg font-display font-bold text-adobe-dark">
                    Desglose de Parámetros &bull; {selectedDate}
                  </h2>
                  <p className="text-xs text-adobe-muted">
                    Ponderación de variables físicas observadas y pronosticadas.
                  </p>
                </div>
                <span className="text-xs font-mono text-moche-700 font-bold">
                  {activeDay.score >= 80
                    ? "Muy recomendable para tu ruta"
                    : activeDay.score >= 60
                      ? "Buena opción para tu ruta"
                      : "Revisa el tiempo de traslado antes de añadirlo"}
                </span>
              </div>

              <FactorsTable
                breakdown={activeDay.breakdown}
                totalScore={activeDay.score}
                category={place.category}
                coastType={place.coast_type}
              />
            </section>
          )}

          {/* Commercial Exclusive: Offers & Breakdown */}
          {place.kind !== "attraction" && place.offers && place.offers.length > 0 && (
            <section className="bg-white rounded-2xl border border-adobe-border p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-display font-bold text-adobe-dark">
                {place.kind === "lodging" ? "Tarifas de Alojamiento" : "Carta y Platos Destacados"}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {place.offers.map((offer, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-adobe-bg rounded-xl border border-adobe-border flex justify-between items-center"
                  >
                    <div>
                      <div className="text-xs font-bold text-adobe-dark">{offer.name}</div>
                      <div className="text-[10px] text-adobe-muted capitalize">
                        {offer.kind} &bull; Registro verificado
                      </div>
                    </div>
                    <div className="text-sm font-extrabold text-moche-700">
                      {offer.currency} {offer.price.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Verified Google Places Reviews */}
          {place.reviews && place.reviews.length > 0 && (
            <section className="bg-white rounded-2xl border border-adobe-border p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-adobe-border/60 pb-3">
                <div>
                  <h2 className="text-lg font-display font-bold text-adobe-dark">
                    Reseñas y Experiencias Verificadas
                  </h2>
                  <p className="text-xs text-adobe-muted">
                    Opiniones públicas archivadas localmente en la base de datos territorial.
                  </p>
                </div>
                {place.stars != null && (
                  <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                    ★ {place.stars.toFixed(1)} / 5.0
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {place.reviews.map((rev, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-adobe-bg rounded-xl border border-adobe-border/80 flex flex-col justify-between space-y-2"
                  >
                    <p className="text-xs text-adobe-dark leading-relaxed line-clamp-4">
                      &ldquo;{rev.text}&rdquo;
                    </p>
                    <div className="pt-2 border-t border-adobe-border/50 flex items-center justify-between text-[11px] text-adobe-muted">
                      <span className="font-bold text-adobe-dark">{rev.author_name}</span>
                      <span>
                        ★ {rev.rating.toFixed(0)} {rev.relative_time ? `• ${rev.relative_time}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Practical guidance is collapsed so it informs without dominating the place detail. */}
          {displayedSafetyReport && (
            <section className="bg-white rounded-2xl border border-adobe-border p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-adobe-border/60 pb-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 mb-1">
                    Orientación para visitantes
                  </div>
                  <h2 className="text-lg font-display font-bold text-adobe-dark flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    <span>Visita con tranquilidad</span>
                  </h2>
                  <p className="text-xs text-adobe-muted">
                    Consejos generales. Confirma los horarios del lugar y las condiciones locales el día de tu visita.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSafetyModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#B85028] hover:bg-[#96401E] text-white shadow-sm transition cursor-pointer"
                >
                  <span>Ver guía de seguridad</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <details className="group">
                <summary className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-100">
                  Ver horario sugerido y precauciones habituales
                </summary>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-800">
                    <div className="flex items-start gap-2.5">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wide">
                          Horario a considerar
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          {displayedSafetyReport.unsafe_hours}
                        </p>
                        {displayedSafetyReport.unsafe_dates_notice && (
                          <p className="mt-2 text-[11px] text-slate-600">
                            {displayedSafetyReport.unsafe_dates_notice}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-950">
                    <div className="flex items-start gap-2.5">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wide">
                          Horario sugerido en la ficha
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-emerald-900">
                          {displayedSafetyReport.safe_hours}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            </section>
          )}

          {/* Interactive Territorial Map (100% Free OpenStreetMap + Leaflet) */}
          <section className="bg-white rounded-2xl border border-adobe-border p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-adobe-border/60 pb-3">
              <div>
                <h2 className="text-lg font-display font-bold text-adobe-dark flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-moche-600" />
                  <span>Mapa Territorial y Georreferenciación</span>
                </h2>
                <p className="text-xs text-adobe-muted">
                  Cartografía abierta interactiva de OpenStreetMap con visualización del destino
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-moche-600 hover:text-moche-700 font-bold bg-moche-50 border border-moche-100 px-3 py-1.5 rounded-xl transition"
                >
                  <span>Ver en OpenStreetMap</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-adobe-dark hover:text-moche-600 font-semibold bg-white border border-adobe-border px-3 py-1.5 rounded-xl transition"
                >
                  <span>Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5 text-adobe-muted" />
                </a>
              </div>
            </div>

            {place.kind === "attraction" && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h2 className="text-sm font-bold text-amber-950">Entrada y boleto turístico</h2>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  Confirma en la boletería la tarifa vigente y si esta visita forma parte de un boleto integrado.
                  Los precios y la vigencia pueden cambiar; lleva soles y conserva tu comprobante.
                </p>
              </div>
            )}
            <PlaceMap place={place} />
          </section>

          {/* Multi-Day Trip Planner & Route Optimizer (Planificador de Itinerario) */}
          <TripPlanner
            currentPlace={place}
            availablePlaces={[
              ...nearbyLodging.map((n) => n.place),
              ...nearbyFood.map((n) => n.place),
            ]}
            onPlaceAdded={() => {
              router.push("/");
            }}
          />

          {/* Attraction Exclusive: Nearby Recommended Lodging & Food */}
          {place.kind === "attraction" && (nearbyLodging.length > 0 || nearbyFood.length > 0) && (
            <section className="bg-white rounded-2xl border border-adobe-border p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-adobe-border/60 pb-3 gap-3">
                <div>
                  <h2 className="text-lg font-display font-bold text-adobe-dark">
                    Dónde Hospedarse y Comer Cerca de {place.name}
                  </h2>
                  <p className="text-xs text-adobe-muted">
                    Recomendaciones calculadas por cercanía física (haversine) y datos confirmados de contacto.
                  </p>
                </div>

                {/* Nearby Tabs */}
                <div className="flex items-center gap-2 bg-adobe-bg p-1 rounded-xl border border-adobe-border text-xs">
                  <button
                    type="button"
                    onClick={() => setNearbyTab("lodging")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      nearbyTab === "lodging"
                        ? "bg-white text-moche-700 shadow-sm"
                        : "text-adobe-muted hover:text-adobe-dark"
                    }`}
                  >
                    <Hotel className="w-3.5 h-3.5" />
                    <span>Hospedaje Cercano ({nearbyLodging.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNearbyTab("food")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      nearbyTab === "food"
                        ? "bg-white text-moche-700 shadow-sm"
                        : "text-adobe-muted hover:text-adobe-dark"
                    }`}
                  >
                    <Utensils className="w-3.5 h-3.5" />
                    <span>Restaurantes Cercanos ({nearbyFood.length})</span>
                  </button>
                </div>
              </div>

              {/* Nearby Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(nearbyTab === "lodging" ? nearbyLodging : nearbyFood).map((item) => {
                  const itemStep = getHeatmapClassification(item.recommendation_score);
                  return (
                    <div
                      key={item.place.id}
                      className="p-4 bg-adobe-bg rounded-xl border border-adobe-border/80 flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-pacific-800 bg-pacific-100 px-2 py-0.5 rounded-md">
                            A {item.distance_km.toFixed(1)} km
                          </span>
                          <span
                            className={`${itemStep.badgeClass} text-[10px] font-bold px-2 py-0.5 rounded-md`}
                          >
                            Score {item.recommendation_score.toFixed(0)}/100
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-adobe-dark leading-snug">
                          {item.place.name}
                        </h4>
                        <p className="text-xs text-adobe-muted leading-relaxed">
                          {item.summary}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-adobe-border/60 flex items-center justify-between gap-2 flex-wrap text-xs">
                        {item.place.maps_url ? (
                          <a
                            href={item.place.maps_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-moche-600 hover:text-moche-700 font-bold"
                          >
                            <span>Cómo llegar</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-adobe-muted">Sin mapa</span>
                        )}

                        {item.place.phone && (
                          <a
                            href={`tel:${item.place.phone}`}
                            className="text-emerald-700 font-semibold hover:underline"
                          >
                            Llamar
                          </a>
                        )}
                        {isHydrated && (
                          activeTripDay?.places.some((selected) => selected.id === item.place.id) ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                              <span>✓</span>
                              <span>En Día {activeDayNumber}</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addRecommendedPlace(item.place)}
                              className="inline-flex items-center gap-1 rounded-lg bg-moche-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-moche-700"
                            >
                              <span>+</span>
                              <span>Añadir a Día {activeDayNumber}</span>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {displayedSafetyReport && (
        <PlaceSafetyModal
          placeName={place.name}
          safetyReport={displayedSafetyReport}
          isOpen={isSafetyModalOpen}
          onClose={() => setIsSafetyModalOpen(false)}
        />
      )}

      <Footer />
    </div>
  );
}
