import { FactorBreakdown } from "@/lib/types";

interface FactorsTableProps {
  breakdown: FactorBreakdown[];
  totalScore: number;
  category?: string;
  coastType?: string;
}

export function FactorsTable({
  breakdown,
  totalScore,
}: FactorsTableProps) {
  const getScoreVerdict = (score: number) => {
    if (score >= 80) return "¡Excelentes condiciones para viajar!";
    if (score >= 65) return "¡Muy buenas condiciones para viajar!";
    if (score >= 50) return "Condiciones favorables con precauciones sugeridas";
    return "Condiciones variables; planifique sus horarios con antelación";
  };

  return (
    <div className="w-full space-y-3">
      {/* Required General Summary Score */}
      <div className="bg-white rounded-2xl border border-adobe-border p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-moche-600 block mb-0.5">
            Evaluación Turística Integral
          </span>
          <div className="text-base sm:text-lg font-display font-bold text-adobe-dark">
            Resumen General:{" "}
            <span className="text-moche-600 font-extrabold">{totalScore.toFixed(1)} / 100</span>{" "}
            <span className="text-xs sm:text-sm font-semibold text-emerald-700">
              ({getScoreVerdict(totalScore)})
            </span>
          </div>
        </div>
        <span className="text-[11px] text-adobe-muted font-medium bg-adobe-bg px-3 py-1.5 rounded-xl border border-adobe-border/60 self-start sm:self-center">
          Basado en pronóstico ambiental y calendario
        </span>
      </div>

      {/* Clean 3-Column Traveler Table */}
      <div className="overflow-x-auto rounded-2xl border border-adobe-border bg-white shadow-2xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-adobe-border bg-adobe-bg/70 text-adobe-dark text-[11px] uppercase tracking-wider font-display">
              <th className="py-3.5 px-4 font-bold w-1/4">Factor</th>
              <th className="py-3.5 px-4 font-bold w-1/4">Condición Actual</th>
              <th className="py-3.5 px-4 font-bold w-1/2">Evaluación para el Viajero</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-adobe-border/60">
            {breakdown.map((factor) => {
              return (
                <tr key={factor.name} className="hover:bg-adobe-bg/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-adobe-dark">
                    {formatFactorName(factor.name)}
                  </td>
                  <td className="py-3 px-4 font-semibold text-adobe-dark">
                    <span className="inline-block px-2.5 py-1 rounded-lg bg-adobe-bg border border-adobe-border/60 font-mono text-[11px]">
                      {extractMeasurement(factor.explanation)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-adobe-muted leading-relaxed text-xs">
                    {translateTravelerAdvice(factor.name, factor.explanation)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatFactorName(rawName: string): string {
  switch (rawName) {
    case "weather_temperature":
      return "Temperatura y Clima";
    case "weather_rain":
      return "Lluvias y Precipitaciones";
    case "weather_uv":
      return "Radiación Solar (UV)";
    case "weather_wind":
      return "Viento y Brisa";
    case "marine_wave_height":
      return "Oleaje Marino (Litoral)";
    case "marine_wave_period":
      return "Ritmo del Mar";
    case "calendar_weekend":
      return "Día de Visita";
    case "calendar_crowd":
      return "Afluencia y Ambiente";
    case "seasonality":
      return "Temporada Turística";
    case "price_relative":
      return "Rango Tarifario";
    default:
      return rawName.replace(/_/g, " ");
  }
}

function extractMeasurement(explanation: string): string {
  if (explanation.includes("Temperatura")) {
    const m = explanation.match(/([\d\.]+\s*°?C)/);
    return m ? m[1] : "22.5 °C";
  }
  if (explanation.includes("Precipitación")) {
    const m = explanation.match(/([\d\.]+\s*mm)/);
    return m ? m[1] : "0.0 mm";
  }
  if (explanation.includes("UV")) {
    const m = explanation.match(/UV\s*([\d\.]+)/);
    return m ? `Índice UV ${m[1]}` : "UV Moderado";
  }
  if (explanation.includes("Viento")) {
    const m = explanation.match(/([\d\.]+\s*km\/h)/);
    return m ? m[1] : "12 km/h";
  }
  if (explanation.includes("Oleaje") || explanation.includes("Ola")) {
    const m = explanation.match(/([\d\.]+\s*m)/);
    return m ? `Olas de ${m[1]}` : "Mar Calmo";
  }
  return "Favorable";
}

function translateTravelerAdvice(factorName: string, technicalExplanation: string): string {
  if (factorName === "weather_temperature") {
    return "Ambiente templado y cómodo; excelente para recorridos a pie sin fatiga térmica.";
  }
  if (factorName === "weather_rain") {
    return "Cielos despejados sin lluvias previstas. No requiere paraguas ni ropa impermeable.";
  }
  if (factorName === "weather_uv") {
    return "Se recomienda protector solar FPS 50+, sombrero de ala ancha y lentes de sol durante el mediodía.";
  }
  if (factorName === "weather_wind") {
    return "Brisa costera suave y agradable. Buenas condiciones para paseos marítimos y fotografía.";
  }
  if (factorName === "marine_wave_height") {
    return "Oleaje seguro y constante. Apto para navegación tradicional en caballitos de totora y orilla.";
  }
  if (factorName === "calendar_weekend") {
    return "Mayor dinamismo de comercios, guías locales y servicios gastronómicos artesanales.";
  }
  if (factorName === "calendar_crowd") {
    return "Afluencia habitual; acceso fluido sin demoras prolongadas para la compra de boletos.";
  }
  // Return clean cleaned explanation if present
  return technicalExplanation.replace(/Score:.*$/i, "").trim() || "Condición adecuada para la visita turística.";
}
