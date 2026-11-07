import urllib.request
import json
import urllib.parse
import os

headers = {"User-Agent": "TurismoLaLibertad/1.0 (info@turismolalibertad.pe; educational tourism project)"}
titles = [
    "File:Trujillo panorámica (2439797278).jpg",
    "File:Huanchaco Beach.jpg",
    "File:Chan Chan 01.jpg",
    "File:Huaca de la luna vue site.jpg",
    "File:Puerto Chicama, Peru beach.jpg",
    "File:Marcahuamachuco- Plaza Principal (Sector El Castillo).jpg"
]

pipe_titles = "|".join(titles)
url = f"https://commons.wikimedia.org/w/api.php?action=query&titles={urllib.parse.quote(pipe_titles)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json"

req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read().decode())

os.makedirs("frontend/public/images/places", exist_ok=True)

mapping = {
    "Trujillo panorámica (2439797278).jpg": "place_1.jpg",
    "Huanchaco Beach.jpg": "place_2.jpg",
    "Chan Chan 01.jpg": "place_3.jpg",
    "Huaca de la luna vue site.jpg": "place_4.jpg",
    "Puerto Chicama, Peru beach.jpg": "place_5.jpg",
    "Marcahuamachuco- Plaza Principal (Sector El Castillo).jpg": "place_6.jpg"
}

attributions = []

for pid, p in data["query"]["pages"].items():
    title = p["title"].replace("File:", "")
    info = p.get("imageinfo", [{}])[0]
    img_url = info.get("url")
    meta = info.get("extmetadata", {})
    artist = meta.get("Artist", {}).get("value", "Wikimedia Commons")
    license_name = meta.get("LicenseShortName", {}).get("value", "CC BY-SA")
    
    print(f"Fetching {title}...")
    target = mapping.get(title)
    if target and img_url:
        dest = os.path.join("frontend/public/images/places", target)
        img_req = urllib.request.Request(img_url, headers=headers)
        with urllib.request.urlopen(img_req) as resp, open(dest, "wb") as f:
            f.write(resp.read())
        size_kb = os.path.getsize(dest) // 1024
        print(f"  Saved {target}: {size_kb} KB | License: {license_name} | Author: {artist[:40]}")
        attributions.append({
            "file": target,
            "title": title,
            "author": artist,
            "license": license_name,
            "url": img_url
        })

with open("ATTRIBUTION.md", "w", encoding="utf-8") as f:
    f.write("# Atribución de Imágenes Wikimedia Commons\n\n")
    f.write("Fotografías reales utilizadas bajo licencias Creative Commons y Dominio Público:\n\n")
    for a in attributions:
        f.write(f"- **{a['file']}** ({a['title']})\n")
        f.write(f"  - **Licencia:** {a['license']}\n")
        f.write(f"  - **Autor:** {a['author']}\n")
        f.write(f"  - **Fuente:** {a['url']}\n\n")

print("Done! ATTRIBUTION.md created and images saved to frontend/public/images/places/")
