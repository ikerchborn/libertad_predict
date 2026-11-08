export function LoadingState({ message = "Consultando datos del observatorio..." }: { message?: string }) {
  return (
    <div className="border border-[#D3CBBF] bg-white p-6 my-4" role="status" aria-label="Cargando">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-3 h-3 bg-[#96532B] animate-pulse" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider text-[#58534A]">
          {message}
        </span>
      </div>
      <div className="space-y-3">
        <div className="h-6 bg-[#ECE7DB] w-3/4 animate-pulse" />
        <div className="h-4 bg-[#ECE7DB] w-full animate-pulse" />
        <div className="h-4 bg-[#ECE7DB] w-5/6 animate-pulse" />
        <div className="h-4 bg-[#ECE7DB] w-2/3 animate-pulse" />
      </div>
    </div>
  );
}

export function EmptyState({
  title = "No se registran destinos para el criterio seleccionado",
  description = "No existen destinos evaluados con los filtros aplicados en el rango de fechas indicado.",
  onReset,
}: {
  title?: string;
  description?: string;
  onReset?: () => void;
}) {
  return (
    <div className="border border-[#D3CBBF] bg-[#ECE7DB] p-8 text-center my-6">
      <div className="w-8 h-1 bg-[#96532B] mx-auto mb-3" />
      <h3 className="font-serif-title text-lg font-bold text-[#1A1815] mb-2">{title}</h3>
      <p className="text-xs text-[#58534A] max-w-md mx-auto mb-4 leading-relaxed">
        {description}
      </p>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="border border-[#1A1815] bg-[#1A1815] text-[#F6F4EE] hover:bg-[#96532B] hover:border-[#96532B] text-xs font-medium px-4 py-2 transition-colors cursor-pointer"
        >
          Restablecer Filtros
        </button>
      )}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="border border-[#B84737] bg-[#EAA399]/20 p-6 my-6 text-left">
      <div className="flex items-center gap-2 mb-2 text-[#571109]">
        <span className="w-2.5 h-2.5 bg-[#B84737] inline-block" />
        <h3 className="font-bold text-xs uppercase tracking-wider">
          Error en la Consulta de Datos
        </h3>
      </div>
      <p className="text-xs font-mono text-[#571109] bg-white/70 border border-[#B84737]/30 p-2.5 mb-4">
        {error}
      </p>
      <div className="flex items-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="border border-[#571109] bg-[#571109] text-white hover:bg-[#86291C] text-xs font-medium px-4 py-1.5 transition-colors cursor-pointer"
          >
            Reintentar Consulta
          </button>
        )}
        <span className="text-[11px] text-[#58534A]">
          Verifique que el backend local (`python -m turismo api`) esté activo en el puerto 8000.
        </span>
      </div>
    </div>
  );
}
