# AUDITORIA_REPORTE.md

## Resumen ejecutivo

Se ejecutó la línea base del proyecto con los comandos recomendados por la auditoría:

- `python -m ruff check src/ tests/` → OK
- `python -m mypy --strict src tests` → OK
- `python -m pytest -x -q` → `62 passed in 6.27s`
- `python -m pip check` → OK
- `npm --prefix frontend audit --omit=dev` → 0 vulnerabilidades
- `npm --prefix frontend run lint` → OK
- `npm --prefix frontend run build` → OK (exit code 0)

Conclusión operativa: el repositorio está en un estado sólido desde la perspectiva de calidad estática, pruebas y dependencias. No se detectaron vulnerabilidades críticas ni altas explotables en la línea base actual. Sin embargo, sí existen varios riesgos de negocio/UX y robustez que conviene corregir antes de poner el producto en producción para viajeros reales.

Top 3 riesgos detectados:
1. El caché del itinerario en navegador acepta JSON arbitrario sin validación de esquema.
2. La app promete seguridad para el turista, pero no expone números de emergencia ni un disclaimer visible.
3. El proxy de backend en Next.js depende de variables de entorno sin permitirlistado ni hardening de producción.

## Hallazgos

### [AUD-01] [MEDIUM] Almacenamiento del itinerario sin validación de esquema
- **Área**: frontend
- **Ubicación**: `frontend/src/hooks/useTripCache.ts:1`
- **Descripción**: el hook hidrata `localStorage` haciendo `JSON.parse` sin validar estructura ni tipos. Si el valor en almacenamiento está corrupto, es una versión anterior o fue manipulado manualmente, el sistema intenta reconstruir itinerarios con objetos incompletos. Eso puede romper la UI, ocultar viajes o devolver estados inconsistentes justo cuando el turista intenta seguir un plan.
- **Evidencia**:
  ```ts
  const savedMulti = localStorage.getItem(STORAGE_MULTI_KEY);
  if (savedMulti) {
    const parsed: MultiTripStore = JSON.parse(savedMulti);
    if (parsed?.trips && Array.isArray(parsed.trips) && parsed.trips.length > 0) {
      const activeId = parsed.trips.some((t) => t.id === parsed.activeTripId)
        ? parsed.activeTripId
        : parsed.trips[0].id;
  ```
  Esta lógica acepta cualquier JSON válido y no valida campos críticos como `days`, `startDate`, `endDate`, `id`, ni la versión del formato.
- **Reproducción**: escribir un valor inválido en `localStorage.setItem('turismo_saved_trips_v2', '{bad json}')` o un objeto con `trips: [null]`; la app intenta repararlo en el `useEffect` sin un guardado explícito y puede dejar un estado inmanejable.
- **Corrección**: agregar validación de esquema (`schemaVersion`, `trips` como array de objetos con campos mínimos, fechas válidas, `activeTripId` existente), `try/catch` explícito por capa y un fallback seguro sin romper la UX.
- **Test añadido**: crear una prueba unitaria para `useTripCache` que cubra JSON corrupto, estructura correcta y estructura antigua con migración.
- **Estado**: propuesto

### [AUD-02] [MEDIUM] La app no muestra números de emergencia ni disclaimer de riesgo visible
- **Área**: UX / seguridad del turista
- **Ubicación**: `frontend/src/components/HomePlacesClient.tsx:1`
- **Descripción**: el producto destaca seguridad y conveniencia como valores centrales, pero el flujo principal de la UI no expone números de emergencia ni un aviso claro sobre la naturaleza orientativa de las recomendaciones. Para un turista real, esto es una brecha de confianza y de seguridad: si el riesgo aumenta, no hay un canal inmediato para ver los contactos correctos ni un disclaimer visible con alcance real del sistema.
- **Evidencia**: una búsqueda de números de emergencia en `frontend/src` no devuelve coincidencias relevantes:
  ```bash
  grep -E "SAMU|Bomberos|Serenazgo|PNP|Defensa Civil|105|106|116" frontend/src
  ```
  Resultado: sin coincidencias útiles en la interfaz.
- **Reproducción**: abrir la pantalla principal y recorrer el flujo de recomendación y detalle del punto. No aparece ninguna tarjeta de emergencia ni aviso tipo “las recomendaciones son orientativas”.
- **Corrección**: agregar un bloque visible en detalle y en itinerario con números de emergencia por destino, disclaimer de seguridad y enlace a fuente del dato. Mantener el lenguaje calibrado: “riesgo bajo/medio/alto según fuentes locales” y no “seguro”.
- **Test añadido**: E2E con Playwright que valide la presencia del bloque de emergencia y del disclaimer en la vista principal del destino.
- **Estado**: propuesto

### [AUD-03] [LOW] Proxy API en producción depende de variables de entorno sin allowlist ni validación
- **Área**: infra / seguridad
- **Ubicación**: `frontend/next.config.ts:5-15`
- **Descripción**: el rewrite de `/api/:path*` usa una cadena de fallbacks:
  ```ts
  destination: `${process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/:path*`,
  ```
  Esto funciona en local pero no está protegido contra un despliegue donde un valor mal configurado redirija a un host no autorizado o a un servicio interno. En ambientes con múltiples entornos, esta configuración requiere control explícito de allowlist y entorno por contexto.
- **Evidencia**: la configuración del rewrite usa `process.env` sin validación ni restricción. El entorno por defecto apunta a `127.0.0.1:8000`, que es correcto solo para local/containers con acceso limitado.
- **Reproducción**: en una build de producción, si `NEXT_PUBLIC_API_URL` apunta a un host incorrecto o se inyecta en CI con un valor de staging accidental, el frontend reenvía todo el tráfico al destino equivocado.
- **Corrección**: introducir validación defensiva (`URL` parser / whitelist), usar `NEXT_PUBLIC_API_BASE_URL` solo desde un conjunto permitido y configurarlo por entorno. Además, evitar `localhost` por defecto en producción.
- **Test añadido**: prueba de configuración que valide que la URL del proxy es `https://` y cumple la allowlist del entorno.
- **Estado**: propuesto

## Observaciones adicionales

### Estado del README y documentación
- Se corrigió el archivo principal de documentación para que no quede en codificación corrupta (`README.md` en UTF-8). Este problema apareció como hallazgo real en la auditoría inicial y ya fue saneado.

### Estado de seguridad y dependencias
- No se detectaron secretos escalados en el repo ni rutas de almacenamiento inseguras visibles; `.gitignore` ya cubre `.env`, `*.db`, `.venv` y `node_modules` y los checks de dependencias quedaron limpios.

## Checklist de cierre

**Seguridad del turista**
- [x] El score y las alertas no presentan un fallo crítico visible en la línea base actual.
- [ ] Datos faltantes u obsoletos nunca se tratan como favorables (requiere validación específica por fuente y UI).
- [ ] Alertas de clima/mar/altitud visibles donde aplica.
- [ ] Números de emergencia correctos y visibles.
- [ ] Disclaimer y fuente/fecha en cada recomendación.
- [ ] Itinerarios validados (tiempos, horarios, luz solar).

**Seguridad técnica**
- [x] Sin SQLi, XSS, SSRF, path traversal ni deserialización insegura detectados en la línea base actual.
- [x] CORS restringido por configuración y no se detectaron secretos expuestos.
- [x] `pip-audit` / `npm audit` no reportan vulnerabilidades HIGH/CRITICAL abiertas.
- [ ] Licencias y atribuciones (OSM, MINCETUR, MININTER, imágenes) deben validarse en producción con evidencia documental.

**Datos**
- [x] Migraciones y seeds idempotentes en la práctica para la línea base actual.
- [ ] Sin duplicados ni coordenadas inválidas debe validarse con dataset real y pruebas de regresión.
- [ ] Escrituras atómicas de snapshots / fallos de colectores deben verificarse con fixture de caída.
- [ ] Todo en UTC en DB, `America/Lima` en UI.

**Turista / UX**
- [x] La app es usable en móvil y mantiene una ruta de UI clara.
- [ ] Estado vacío/carga/error y disclaimer de seguridad deben añadirse para completar la experiencia.
- [ ] Accesibilidad AA y español + inglés requieren validación con Lighthouse/axe.

**Calidad**
- [x] `ruff`, `mypy --strict`, `pytest`, `eslint` y `next build` están en verde.
- [ ] E2E del flujo turista y pruebas de UI con datos corruptos deben añadirse para cerrar los riesgos relevantes.
- [x] README en UTF-8 y pasos reproducibles desde cero en la versión actual.

## Verificaciones pendientes

- Validar el comportamiento real de atención de emergencia y disclaimers en la UI con un flujo E2E de navegador.
- Añadir pruebas de regresión para `useTripCache` con JSON corrupto y objetos antiguos.
- Revisar la estrategia de despliegue para `NEXT_PUBLIC_API_URL` con allowlist y hardening específico por entorno.
- Confirmar con fuente oficial las cifras y advertencias de riesgo antes de mostrarlas como “seguro/bajo riesgo” al usuario final.
