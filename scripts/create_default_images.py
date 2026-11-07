import os
from PIL import Image, ImageDraw

os.makedirs("frontend/public/images/defaults", exist_ok=True)

CATEGORIES = {
    "default_attraction.webp": {
        "title": "ATRACTIVO TURÍSTICO",
        "sub": "Patrimonio Cultural y Natural de La Libertad",
        "c_top": (194, 91, 52),      # Mochica terracotta
        "c_bot": (110, 44, 26),
        "accent": (240, 168, 78)
    },
    "default_lodging.webp": {
        "title": "HOSPEDAJE & ALOJAMIENTO",
        "sub": "Hotel & Estancia en La Libertad",
        "c_top": (35, 55, 95),       # Deep slate indigo
        "c_bot": (18, 28, 52),
        "accent": (102, 168, 255)
    },
    "default_food.webp": {
        "title": "GASTRONOMÍA & SABORES",
        "sub": "Restaurante y Cocina Tradicional Norteña",
        "c_top": (168, 92, 28),      # Warm amber ceviche
        "c_bot": (92, 45, 12),
        "accent": (255, 204, 102)
    },
    "default_activity.webp": {
        "title": "ACTIVIDAD & AVENTURA",
        "sub": "Surf, Tours y Experiencias en La Libertad",
        "c_top": (18, 98, 128),      # Coastal Pacific teal
        "c_bot": (10, 52, 72),
        "accent": (78, 205, 196)
    }
}

width, height = 800, 533

for filename, info in CATEGORIES.items():
    img = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(img)
    
    # Linear vertical gradient
    r1, g1, b1 = info["c_top"]
    r2, g2, b2 = info["c_bot"]
    for y in range(height):
        t = y / float(height)
        r = int(r1 * (1 - t) + r2 * t)
        g = int(g1 * (1 - t) + g2 * t)
        b = int(b1 * (1 - t) + b2 * t)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    
    # Decorative subtle circles
    acc = info["accent"]
    draw.ellipse([width - 150, -50, width + 150, 250], outline=(acc[0], acc[1], acc[2]), width=2)
    draw.ellipse([width - 180, -80, width + 180, 280], outline=(acc[0], acc[1], acc[2]), width=1)
    draw.ellipse([-80, height - 200, 220, height + 100], outline=(acc[0], acc[1], acc[2]), width=1)

    # Frame line
    draw.rectangle([24, 24, width - 24, height - 24], outline=(255, 255, 255), width=1)
    
    # Text strings
    title = info["title"]
    sub = info["sub"]
    
    badge_w, badge_h = 240, 36
    bx1 = (width - badge_w) // 2
    by1 = height // 2 - 40
    draw.rounded_rectangle([bx1, by1, bx1 + badge_w, by1 + badge_h], radius=18, fill=(0, 0, 0), outline=acc, width=2)
    
    draw.text((width // 2, height // 2 - 22), title, fill=(255, 255, 255), anchor="mm")
    draw.text((width // 2, height // 2 + 25), sub, fill=(220, 220, 220), anchor="mm")
    draw.text((width // 2, height - 45), "Turismo La Libertad - Informacion Verificada", fill=(180, 180, 180), anchor="mm")

    dest = os.path.join("frontend/public/images/defaults", filename)
    img.save(dest, "WEBP", quality=78, method=6)
    size_kb = os.path.getsize(dest) // 1024
    print(f"Created {filename}: {size_kb} KB")

print("Defaults created successfully!")
