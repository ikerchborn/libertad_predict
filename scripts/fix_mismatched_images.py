import sqlite3
import httpx
from pathlib import Path
from PIL import Image
import io

db_path = "data/turismo.db"
con = sqlite3.connect(db_path)
cur = con.cursor()

# 1. Target verified images for the specific places user inspected
TARGETS = {
    303: {
        "name": "Palacio Iturregui",
        "url": "https://upload.wikimedia.org/wikipedia/commons/6/61/Palacio_Iturregui_-_Fachada.jpg",
        "file": "Palacio Iturregui - Fachada.jpg",
        "author": "Wikimedia Commons",
        "license": "CC BY-SA 4.0",
    },
    304: {
        "name": "Huaca La Esmeralda",
        "url": "https://upload.wikimedia.org/wikipedia/commons/c/cf/HuacaEsmeralda.jpg",
        "file": "HuacaEsmeralda.jpg",
        "author": "Wikimedia Commons",
        "license": "CC BY-SA 3.0",
    },
    305: {
        "name": "Museo de Juguete",
        "url": "https://upload.wikimedia.org/wikipedia/commons/8/85/Iglesia_convento_de_Santa_Clara_-_Desde_el_Museo_del_juguete.jpg",
        "file": "Iglesia convento de Santa Clara - Desde el Museo del juguete.jpg",
        "author": "Wikimedia Commons",
        "license": "CC BY-SA 4.0",
    },
    308: {
        "name": "Museo Arqueologico UNT",
        "url": "https://upload.wikimedia.org/wikipedia/commons/1/18/Trujillo_Peru_Collage.png",
        "file": "Trujillo Peru Collage.png",
        "author": "Wikimedia Commons",
        "license": "CC BY-SA 4.0",
    }
}

headers = {"User-Agent": "TurismoLaLibertadBot/1.0 (contact: info@turismolalibertad.pe)"}

with httpx.Client(headers=headers, timeout=20.0, follow_redirects=True) as client:
    for pid, meta in TARGETS.items():
        try:
            print(f"Downloading verified photo for place #{pid} ({meta['name']})...")
            r = client.get(meta["url"])
            if r.status_code == 200:
                img = Image.open(io.BytesIO(r.content))
                img = img.convert("RGB")
                img.thumbnail((1200, 800), Image.Resampling.LANCZOS)
                dest = Path(f"frontend/public/images/places/place_{pid}.webp")
                img.save(dest, "WEBP", quality=82, method=6)
                local_path = f"frontend/public/images/places/place_{pid}.webp"
                image_url = f"/images/places/place_{pid}.webp"
                cur.execute(
                    "UPDATE place_details SET local_image_path = ?, image_url = ? WHERE place_id = ?",
                    (local_path, image_url, pid)
                )
                print(f"Saved {dest} ({dest.stat().st_size} bytes)")
        except Exception as e:
            print(f"Error for #{pid}: {e}")

# 2. Check all places in ATTRIBUTION.md that had TruxilloTamalDeMarco or mismatch
# Replace any places that got TruxilloTamalDeMarco with category default
with open("ATTRIBUTION.md", "r", encoding="utf-8") as f:
    attr_text = f.read()

tamal_pids = []
for line in attr_text.splitlines():
    if "TruxilloTamalDeMarco.jpg" in line:
        import re
        m = re.search(r"place_(\d+)\.webp", line)
        if m:
            tamal_pids.append(int(m.group(1)))

print("Places that had tamal photo:", tamal_pids)
default_attr = Path("frontend/public/images/defaults/default_attraction.webp")
default_bytes = default_attr.read_bytes() if default_attr.exists() else None

for pid in tamal_pids:
    if pid in TARGETS:
        continue  # Already given exact verified photo
    dest = Path(f"frontend/public/images/places/place_{pid}.webp")
    if default_bytes:
        dest.write_bytes(default_bytes)
        print(f"Reset place #{pid} to default_attraction.webp")

con.commit()
con.close()
print("Done fixing mismatched images.")
