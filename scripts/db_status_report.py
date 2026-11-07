import sqlite3

conn = sqlite3.connect("data/turismo.db")
c = conn.cursor()

print("=== CONTEOS TOTALES EN PLACES ===")
print("Total lugares:", c.execute("SELECT COUNT(*) FROM places").fetchone()[0])

print("\n=== AGRUPADOS POR SOURCE ===")
for row in c.execute("SELECT source, COUNT(*) FROM places GROUP BY source"):
    print(f"  Source: {row[0]:<10} | Cantidad: {row[1]}")

print("\n=== AGRUPADOS POR CATEGORIA (TOTAL) ===")
for row in c.execute("SELECT category, COUNT(*) FROM places GROUP BY category"):
    print(f"  Categoria: {row[0]:<15} | Cantidad: {row[1]}")

print("\n=== LUGARES CON SOURCE = 'osm' POR CATEGORIA ===")
for row in c.execute("SELECT category, COUNT(*) FROM places WHERE source='osm' GROUP BY category"):
    print(f"  Categoria: {row[0]:<15} | Cantidad: {row[1]}")

print("\n=== LUGARES CANONICOS (SOURCE = 'manual') ===")
for row in c.execute("SELECT id, name, category, source, lat, lon FROM places WHERE source='manual' ORDER BY id"):
    print(f"  ID: {row[0]} | {row[1]:<35} | {row[2]:<12} | Source: {row[3]} | Coords: ({row[4]}, {row[5]})")

print("\n=== ESTADO DE SCORES PRECOMPUTADOS ===")
print("Total scores en DB:", c.execute("SELECT COUNT(*) FROM scores").fetchone()[0])
dates = c.execute("SELECT MIN(date), MAX(date), COUNT(DISTINCT date) FROM scores").fetchone()
print(f"Rango de fechas con scores: {dates[0]} hasta {dates[1]} ({dates[2]} dias distintos)")

print("\n=== ULTIMAS EJECUCIONES EN SCRAPE_RUNS ===")
for row in c.execute("SELECT collector, status, rows_upserted, rows_rejected, strftime('%Y-%m-%d %H:%M:%S', started_at), substr(coalesce(error, ''), 1, 60) FROM scrape_runs ORDER BY id DESC LIMIT 5"):
    print(f"  Collector: {row[0]:<12} | Status: {row[1]:<8} | Upserted: {row[2]:<4} | Rejected: {row[3]:<4} | Started: {row[4]} | Err: {row[5]}")
