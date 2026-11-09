import { getHeatmapClassification } from "@/lib/types";

interface ScoreBadgeProps {
  score: number | null;
  size?: "sm" | "md" | "lg";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full text-xs font-semibold">
        Sin score
      </span>
    );
  }

  const step = getHeatmapClassification(score);

  if (size === "sm") {
    return (
      <span
        className={`${step.badgeClass} px-2.5 py-0.5 rounded-full font-display font-bold text-xs inline-flex items-center gap-1`}
      >
        <span>{step.name}</span>
      </span>
    );
  }

  if (size === "lg") {
    return (
      <div
        className={`${step.badgeClass} px-4 py-2 rounded-2xl text-center inline-block shadow-sm`}
      >
        <div className="font-display text-3xl font-extrabold leading-none">
          {Math.round(score)}
        </div>
        <div className="text-xs font-bold uppercase tracking-wider mt-1">
          {step.name}
        </div>
        <div className="text-[10px] opacity-80 mt-0.5">Orientación para tu visita</div>
      </div>
    );
  }

  // Default 'md'
  return (
    <span
      className={`${step.badgeClass} px-3 py-1 rounded-full font-display font-extrabold text-xs shadow-md inline-flex items-center gap-1`}
    >
      {step.name}
    </span>
  );
}
