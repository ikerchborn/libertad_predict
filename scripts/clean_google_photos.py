import sqlite3

conn = sqlite3.connect("data/turismo.db")
c = conn.cursor()
c.execute("""
    UPDATE place_details 
    SET image_url = NULL 
    WHERE image_url LIKE '%googleapis.com%' OR image_url LIKE '%googleusercontent.com%'
""")
print(f"Cleared {c.rowcount} google photo URLs from place_details")
conn.commit()
conn.close()
