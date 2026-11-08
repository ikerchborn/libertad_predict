import { HEATMAP_STEPS } from "@/lib/types";

export function LegendBar() {
  return (
    <div className="border border-[#D3CBBF] bg-[#ECE7DB] px-3 py-2 text-xs flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="font-bold text-[11px] uppercase tracking-wider text-[#58534A]">
        Escala de Evaluación:
      </span>
      {HEATMAP_STEPS.map((step) => (
        <div key={step.level} className="flex items-center gap-1.5">
          <span
            className="w-3.5 h-3.5 border inline-block"
            style={{
              backgroundColor: step.bgHex,
              borderColor: step.borderHex,
            }}
            aria-hidden="true"
          />
          <span className="font-medium text-[#1A1815]">
            {step.rangeLabel} <span className="text-[#58534A]">{step.name}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
