"use client";

import { CalendarDay, getHeatmapClassification } from "@/lib/types";

interface HeatmapCalendarProps {
  days: CalendarDay[];
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
}

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export function HeatmapCalendar({
  days,
  selectedDate,
  onSelectDate,
}: HeatmapCalendarProps) {
  if (!days || days.length === 0) {
    return (
      <div className="bg-adobe-bg rounded-xl border border-adobe-border p-6 text-center text-xs text-adobe-muted">
        No hay datos de pronóstico para el período consultado.
      </div>
    );
  }

  // Sort days by date ASC
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));

  // Determine starting weekday of first day (Monday is 0, Sunday is 6)
  const firstDate = new Date(sortedDays[0].date + "T00:00:00");
  const firstDayOfWeek = (firstDate.getDay() + 6) % 7;

  // Empty leading slots for calendar alignment
  const leadingSlots = Array.from({ length: firstDayOfWeek });

  return (
    <div className="w-full space-y-3">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center text-[11px] sm:text-xs font-bold uppercase tracking-wider text-adobe-muted">
        {WEEKDAYS.map((dayName, idx) => (
          <div key={idx} className="py-1">
            {dayName}
          </div>
        ))}
      </div>

      {/* 7-column calendar grid */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {leadingSlots.map((_, idx) => (
          <div
            key={`leading-${idx}`}
            className="border border-dashed border-adobe-border bg-adobe-bg/40 rounded-xl min-h-[64px] sm:min-h-[80px] opacity-40"
            aria-hidden="true"
          />
        ))}

        {sortedDays.map((day) => {
          const step = getHeatmapClassification(day.score);
          const isSelected = day.date === selectedDate;
          const dayNum = day.date.split("-")[2];
          const monthNum = day.date.split("-")[1];

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDate(day.date)}
              className={`text-left p-1.5 sm:p-2.5 rounded-xl border transition-all cursor-pointer relative min-h-[64px] sm:min-h-[80px] flex flex-col justify-between ${
                step.badgeClass
              } ${
                isSelected
                  ? "ring-2 ring-moche-700 shadow-md scale-[1.02] z-10"
                  : "hover:scale-[1.01] hover:shadow-sm"
              }`}
              title={`Fecha: ${day.date} — Score: ${day.score.toFixed(1)} (${step.name})`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[10px] sm:text-xs font-bold leading-none">
                  {dayNum}/{monthNum}
                </span>
                {isSelected && (
                  <span className="w-2 h-2 rounded-full bg-moche-700 inline-block" title="Seleccionado" />
                )}
              </div>

              <div className="my-0.5">
                <span className="font-display text-xl sm:text-2xl font-extrabold leading-none block">
                  {day.score.toFixed(0)}
                </span>
              </div>

              <div className="text-[9px] sm:text-[11px] font-semibold tracking-tight truncate leading-tight opacity-90">
                {step.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* Discrete scale legend bar */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-adobe-muted border-t border-adobe-border/40">
        <span className="font-semibold text-adobe-dark text-[11px] uppercase tracking-wider">
          Escala de Evaluación:
        </span>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="badge-critico px-2 py-0.5 rounded-full text-[10px] font-bold">0 - 39 Crítico</span>
          <span className="badge-desfavorable px-2 py-0.5 rounded-full text-[10px] font-bold">40 - 54 Desfavorable</span>
          <span className="badge-regular px-2 py-0.5 rounded-full text-[10px] font-bold">55 - 69 Regular</span>
          <span className="badge-favorable px-2 py-0.5 rounded-full text-[10px] font-bold">70 - 84 Favorable</span>
          <span className="badge-optimo px-2 py-0.5 rounded-full text-[10px] font-bold">85 - 100 Óptimo</span>
        </div>
      </div>
    </div>
  );
}
