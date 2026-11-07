import sqlite3

conn = sqlite3.connect("data/turismo.db")
c = conn.cursor()
c.execute("SELECT id, name, lat, lon FROM places WHERE kind = 'attraction'")
rows = c.fetchall()
print(f"Total attractions: {len(rows)}")
for r in rows:
    print(r[0], r[1])
conn.close()
