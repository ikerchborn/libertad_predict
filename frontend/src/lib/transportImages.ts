/** Matches transit service labels to the curated vehicle image catalog. */
import images from "@/data/transport_images.json";

type TransportImage = (typeof images)[number];

/**
 * Selects the best known vehicle image from the service name and optional route code.
 *
 * Unmatched services use the generic urban-transit image when it exists in the catalog.
 */
export function getTransportImage(serviceName: string, code?: string): TransportImage | null {
  const text = `${serviceName} ${code ?? ""}`.toLowerCase();
  if (text.includes("chicama") || text.includes("dorado")) return images.find((item) => item.id === "chicama-premium") ?? null;
  if (text.includes("ecotur") || text.includes("tunesa") || text.includes("levitur") || text.includes("huamachuco")) return images.find((item) => item.id === "ecotur") ?? null;
  if (text.includes("colectivo")) return images.find((item) => item.id === "colectivos-ascope") ?? null;
  if (text.includes("mototaxi")) return images.find((item) => item.id === "mototaxis-magdalena-cao") ?? null;
  if (text.includes("caballito") || text.includes("c-27")) return images.find((item) => item.id === "caballito-de-totora-c27b") ?? null;
  if (text.includes("ethsa") || text.includes("línea b") || text.includes("linea b")) return images.find((item) => item.id === "ethsa-linea-b") ?? null;
  if (text.includes("salaverry")) return images.find((item) => item.id === "salaverry-express") ?? null;
  return images.find((item) => item.id === "urbanas-trujillo") ?? null;
}
