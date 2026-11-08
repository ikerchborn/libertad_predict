export function Footer() {
  return (
    <footer className="bg-white border-t border-adobe-border mt-12 py-8 text-xs text-adobe-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-lg bg-moche-700 text-white flex items-center justify-center font-display font-bold text-sm">
            L
          </div>
          <span className="font-display font-bold text-adobe-dark text-sm">
            La Libertad Predict
          </span>
        </div>
        <p className="text-center md:text-right text-xs">
          &copy; 2026 La Libertad Predict &bull; Motor de decisiones para el turismo regional. Fuentes verificadas: SENAMHI, MTC, IMARPE, Open-Meteo, OpenStreetMap.
        </p>
      </div>
    </footer>
  );
}
