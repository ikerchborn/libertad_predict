/**
 * Place detail page — Server Component.
 * Fetches place metadata and 16-day calendar server-side.
 * Client Component handles heatmap interactivity.
 */
import { notFound } from "next/navigation";
import {
  serverFetchPlace,
  serverFetchCalendar,
  serverFetchNearby,
  todayISO,
  forecastRange,
} from "@/shared/api/server";
import { PlaceDetailClient } from "@/features/places";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlaceDetailPage({ params }: PageProps) {
  const { id: idStr } = await params;
  const placeId = parseInt(idStr, 10);

  if (isNaN(placeId)) notFound();

  const { from, to } = forecastRange();

  const [place, calendarData] = await Promise.all([
    serverFetchPlace(placeId).catch(() => null),
    serverFetchCalendar(placeId, from, to).catch(() => null),
  ]);

  if (!place) notFound();

  let nearbyLodging: any[] = [];
  let nearbyFood: any[] = [];
  if (place.kind === "attraction") {
    const [lodging, food] = await Promise.all([
      serverFetchNearby(placeId, "lodging", 3).catch(() => []),
      serverFetchNearby(placeId, "food", 3).catch(() => []),
    ]);
    nearbyLodging = lodging;
    nearbyFood = food;
  }

  const today = todayISO();
  // Default selected date: today if in calendar, else first available
  const days = calendarData?.days ?? [];
  const hasToday = days.some((d) => d.date === today);
  const initialDate = hasToday ? today : (days[0]?.date ?? today);

  return (
    <PlaceDetailClient
      place={place}
      calendarDays={days}
      initialDate={initialDate}
      forecastFrom={from}
      forecastTo={to}
      nearbyLodging={nearbyLodging}
      nearbyFood={nearbyFood}
    />
  );
}
