/**
 * Home page — Server Component.
 * Fetches the initial set of places server-side so the first paint contains real data.
 * Subsequent filter changes are handled client-side by HomePlacesClient.
 */
import { serverFetchPlaces, todayISO, forecastRange } from "@/shared/api/server";
import { HomePlacesClient } from "@/features/places";

// Always server-render on each request so we always use fresh data from the local API.
// This avoids the build-time static generation where the API may not be reachable.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const today = todayISO();
  const { from, to } = forecastRange();

  // Build the list of available forecast dates (from → to, inclusive)
  const availableDates: string[] = [];
  const cursor = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  while (cursor <= end) {
    availableDates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Fetch initial places for today; fall back to empty list on error (shows ErrorState)
  let initialPlaces = await serverFetchPlaces({ date: today, limit: 500 }).catch(
    () => []
  );

  // If today has no scores (outside forecast window), try the first available date
  if (initialPlaces.length === 0 && availableDates.length > 0) {
    initialPlaces = await serverFetchPlaces({
      date: availableDates[0],
      limit: 500,
    }).catch(() => []);
  }

  const initialDate =
    initialPlaces.length > 0
      ? (initialPlaces[0]?.score !== null ? today : availableDates[0])
      : availableDates[0] ?? today;

  return (
    <HomePlacesClient
      initialPlaces={initialPlaces}
      initialDate={initialDate}
      availableDates={availableDates}
    />
  );
}
