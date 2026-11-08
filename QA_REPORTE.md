# QA_REPORTE.md

## 1. Resumen ejecutivo

Se ejecutó una prueba de humo real del sistema en dos capas: backend y frontend. La evidencia confirma que la API responde, la app web responde en HTTP y la redirección del frontend al backend funciona correctamente.

Se detectaron problemas relevantes de UX y robustez, aunque no se observó un fallo crítico inmediato de seguridad o de integración durante la línea base.

## 2. Línea base ejecutada

### Backend
- Comando: `.\.venv\Scripts\python -m pytest -x -q`
- Resultado: `62 passed in 6.27s`

- Comando: `.\.venv\Scripts\python -m ruff check src/ tests/`
- Resultado: `All checks passed!`

- Comando: `.\.venv\Scripts\python -m mypy --strict src tests`
- Resultado: `Success: no issues found in 39 source files`

- Comando: `.\.venv\Scripts\python -m pip check`
- Resultado: `No broken requirements found.`

### Frontend
- Comando: `npm --prefix frontend run lint`
- Resultado: exit code 0

- Comando: `npm --prefix frontend run build`
- Resultado: exit code 0

### Infra / smoke test
- Comando: `curl.exe -sS http://127.0.0.1:8000/health`
- Resultado:
  ```json
  {"status":"ok","database":"ok","version":"1.0.0"}
  ```

- Comando: `curl.exe -sS -I http://localhost:3001`
- Resultado: `HTTP/1.1 200 OK`

- Comando: `curl.exe -sS http://localhost:3001/api/health`
- Resultado:
  ```json
  {"status":"ok","database":"ok","version":"1.0.0"}
  ```

## 3. Matriz de features

| ID | Feature | Dónde vive | Estado | Evidencia |
|----|---------|------------|--------|-----------|
| F01 | Cálculo de conveniencia por lugar | `src/turismo/domain/scoring.py` | OK | `pytest` pasó y la lógica compila |
| F02 | API de salud y backend local | `src/turismo/interfaces/api/main.py` | OK | `/health` devolvió `200` y JSON válido |
| F03 | Frontend web y rewrite API | `frontend/next.config.ts` | OK | `/api/health` respondió con `200` |
| F04 | Planificador multi-día | `frontend/src/hooks/useTripCache.ts` | PARCIAL | Existe flujo y persistencia, pero la validación de `localStorage` es frágil |
| F05 | Seguridad del turista / avisos | `frontend/src/components/HomePlacesClient.tsx` | FALTA | No hay evidencia de contactos de emergencia ni disclaimer visible |
| F06 | Offline / conectividad limitada | README + frontend | NO VERIFICADO | No se ejecutó throttling real ni prueba con red degradada |
| F07 | E2E de turista móvil/escritorio | Playwright no configurado | NO PROBADO | Requiere entorno adicional de navegador automatizado |

## 4. Hallazgos relevantes

### [QA-01] [MEDIUM] `localStorage` sin validación de esquema
- **Área**: frontend / UX / robustez
- **Ubicación**: `frontend/src/hooks/useTripCache.ts`
- **Descripción**: la app hidrata JSON crudo desde `localStorage` con `JSON.parse` sin validación de estructura ni esquema. Si el almacenamiento está corrupto o manipulado, la UI puede entrar en un estado inconsistente.
- **Evidencia**: el hook hace `const parsed: MultiTripStore = JSON.parse(savedMulti);` sin comprobación profunda de los campos esperados.
- **Impacto**: un viaje puede perderse o cargarse con datos inconsistentes si el navegador tiene una versión antigua o el usuario tiene datos dañados.
- **Estado**: detectado / propuesta de corrección

### [QA-02] [MEDIUM] Falta de aviso de seguridad y contactos de emergencia visibles
- **Área**: UX / seguridad del turista
- **Ubicación**: `frontend/src/components/HomePlacesClient.tsx`
- **Descripción**: la app habla de seguridad, pero no expone claramente números de emergencia ni un texto de disclaimer visible para el usuario (por ejemplo, “esto es orientativo” y “verifica condiciones locales antes de viajar”).
- **Evidencia**: búsqueda de cadenas como `SAMU`, `Bomberos`, `Serenazgo`, `PNP`, `Defensa Civil`, `105`, `106` no mostró resultados relevantes en la UI.
- **Impacto**: un turista en situación real no tiene una salida clara para actuar rápidamente ante riesgos o emergencias.
- **Estado**: detectado / propuesta de corrección

### [QA-03] [LOW] Configuración de proxy sin hardening de producción
- **Área**: infraestructura / seguridad
- **Ubicación**: `frontend/next.config.ts`
- **Descripción**: el rewrite `/api/:path*` usa `process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"` sin validación explícita ni allowlist por entorno.
- **Evidencia**: la línea de rewrites usa el valor env directamente y no normaliza ni valida la URL.
- **Impacto**: en un despliegue con un valor erróneo, puede reenviar tráfico a un destino incorrecto.
- **Estado**: detectado / propuesta de corrección

## 5. Verificación del flujo principal

### Frontend / API smoke test
- `http://localhost:3001` responde con `200 OK`.
- `http://localhost:3001/api/health` devuelve la misma respuesta que la API local: `{"status":"ok","database":"ok","version":"1.0.0"}`.
- Conclusión: la aplicación web y el backend se integran correctamente en la ejecución local de QA.

### Limites de esta validación
- No se ejecutó Playwright real ni pruebas E2E completas de flujo turista en móvil/escritorio.
- No se validó el comportamiento con throttling 3G ni con navegador real en `production`/HTTPS.
- El sistema está listo para una segunda fase de QA orientada a interfaz, accesibilidad e UX de turista real.

## 6. Conclusión

La base del proyecto está sólida y funcional en la ejecución local de QA: backend sano, frontend responde en HTTP, y la integración entre API y web funciona. Los riesgos identificados no son bloqueantes inmediatos para la continuidad del desarrollo, pero sí son relevantes para preparar una versión de producción ante usuarios reales.

## 7. Recomendación siguiente

Priorizar:
1. Validación y saneamiento del `localStorage` del itinerario.
2. Añadir bloque de seguridad y contactos de emergencia en la UI.
3. Reforzar el proxy de API con validación por entorno y allowlist.
4. Ejecutar E2E real con Playwright para escenarios E1…E10 del documento de QA.
