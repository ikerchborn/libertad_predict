import Link from "next/link";
import { Compass, MapPin } from "lucide-react";
import { PlacesCatalogClient } from "@/components/PlacesCatalogClient";
import { Footer } from "@/components/Footer";
import { serverFetchPlaces, todayISO } from "@/shared/api/server";

export const dynamic = "force-dynamic";

export default async function PlacesPage() {
  const places = await serverFetchPlaces({ date: todayISO(), limit: 500 });

  return (
    <div className="min-h-screen bg-adobe-bg text-adobe-dark">
      <header className="sticky top-0 z-40 border-b border-adobe-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Compass className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">
              Libertad<span className="text-orange-600">GO</span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-adobe-border px-3 py-2 text-xs font-semibold text-adobe-dark transition hover:border-moche-300 hover:bg-moche-50"
          >
            <MapPin className="h-4 w-4" />
            Volver al planificador
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-moche-600">
            Descubre La Libertad
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-adobe-dark sm:text-3xl">
            Todos los lugares
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-adobe-muted">
            Explora atractivos, hospedajes, restaurantes y actividades. Esta página es solo para descubrir lugares; organiza tus visitas desde el planificador.
          </p>
        </div>

        <PlacesCatalogClient places={places} />
      </main>
      <Footer />
    </div>
  );
}
