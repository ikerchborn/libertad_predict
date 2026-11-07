import sqlite3

conn = sqlite3.connect("data/turismo.db")
c = conn.cursor()
c.execute("SELECT kind, count(*) FROM places GROUP BY kind")
for r in c.fetchall():
    print(r[0], r[1])
conn.close()
