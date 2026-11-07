#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
descargar_imagenes_transporte.py

Descarga las imágenes indicadas por el JSON ubicado junto a este script,
las convierte a formato web (WebP por defecto, ≤ 800 px) y las guarda
en la misma carpeta img_buses.

Requisitos:
    pip install requests Pillow

Uso rápido:
    python descargar_imagenes_transporte.py

Uso avanzado:
    python descargar_imagenes_transporte.py --folder ./img_buses --format both
    python descargar_imagenes_transporte.py --only ecotur
    python descargar_imagenes_transporte.py --list
    python descargar_imagenes_transporte.py --dry-run
"""

import argparse
import io
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from PIL import Image, UnidentifiedImageError

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ─────────────────────────────────────────────────────────────────────
#  CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────────────
SCRIPT_FOLDER = Path(__file__).resolve().parent
DEFAULT_FOLDER = SCRIPT_FOLDER
DEFAULT_JSON = SCRIPT_FOLDER / "deepseek_json_20261107_4370cc.json"
MAX_WIDTH      = 800
MAX_HEIGHT     = 800
WEBP_QUALITY   = 82
JPEG_QUALITY   = 85
TIMEOUT        = 25
RETRIES        = 2

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
}

# ─────────────────────────────────────────────────────────────────────
#  CATÁLOGO
#  Se carga exclusivamente desde el JSON junto al script. No hay
#  placeholders ni URLs alternativas definidas en el código.
# ─────────────────────────────────────────────────────────────────────
def load_catalog(json_path: Path) -> list[dict]:
    """Carga únicamente images[].url del JSON elegido por el usuario."""
    data = json.loads(json_path.read_text(encoding="utf-8-sig"))
    entries = data.get("images")
    if not isinstance(entries, list):
        raise ValueError(f"{json_path} no contiene un arreglo 'images'")

    catalog = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        image_url = entry.get("url")
        if not isinstance(image_url, str) or not image_url.startswith(("http://", "https://")):
            raise ValueError(f"Entrada {entry.get('id', '<sin id>')} no tiene una URL http(s) válida")
        catalog.append({
            "id": str(entry["id"]),
            "name": str(entry.get("name", entry["id"])),
            "type": str(entry.get("type", "Transporte")),
            "urls": [image_url],
        })

    if not catalog:
        raise ValueError(f"{json_path} no contiene imágenes descargables")
    return catalog

# ─────────────────────────────────────────────────────────────────────
#  UTILIDADES
# ─────────────────────────────────────────────────────────────────────
def log(msg: str, kind: str = "info") -> None:
    icons = {"info": "-", "ok": "OK", "err": "ERROR", "warn": "WARN"}
    print(f"[{icons.get(kind, '-')}] {msg}")

def safe_filename(name: str) -> str:
    return re.sub(r"[^\w\-.]", "_", name).strip("._") or "file"

def extract_image_from_html(html: str, base_url: str) -> str | None:
    """Busca og:image / twitter:image / primer <img> relevante."""
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)["\']',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.IGNORECASE)
        if m:
            return urljoin(base_url, m.group(1))
    # Fallback: primer <img> con extensión de imagen conocida
    for m in re.finditer(r'<img[^>]+src=["\']([^"\']+)["\']', html, re.IGNORECASE):
        src = m.group(1)
        if any(x in src.lower() for x in (".jpg", ".jpeg", ".png", ".webp")):
            return urljoin(base_url, src)
    return None

def fetch_image_bytes(session: requests.Session, url: str) -> bytes:
    """
    Descarga una URL y devuelve bytes de imagen.
    Si la URL sirve HTML, intenta extraer el og:image y reintentar.
    """
    r = session.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
    r.raise_for_status()
    ctype = r.headers.get("Content-Type", "").lower()

    if ctype.startswith("image/"):
        return r.content

    if "html" in ctype or "text/" in ctype:
        candidate = extract_image_from_html(r.text, r.url)
        if candidate and candidate != url:
            return fetch_image_bytes(session, candidate)
        raise ValueError(f"HTML sin imagen extraíble (ctype={ctype})")

    raise ValueError(f"Contenido no es imagen (ctype={ctype})")

def optimize_image(raw: bytes) -> Image.Image:
    """Carga, normaliza a RGB y redimensiona conservando aspecto."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except UnidentifiedImageError:
        raise ValueError("El archivo descargado no es una imagen válida")

    # Transparencia → fondo blanco
    if img.mode in ("RGBA", "LA", "P"):
        if img.mode == "P":
            img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "RGBA":
            bg.paste(img, mask=img.split()[-1])
        else:
            bg.paste(img.convert("RGB"))
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Redimensionar (thumbnail preserva proporción, nunca agranda)
    img.thumbnail((MAX_WIDTH, MAX_HEIGHT), Image.LANCZOS)
    return img

def save_optimized(img: Image.Image, base_path: Path, fmt: str) -> list[Path]:
    """Guarda en WebP y/o JPEG. Devuelve las rutas creadas."""
    paths: list[Path] = []

    if fmt in ("webp", "both"):
        webp_path = base_path.with_suffix(".webp")
        try:
            img.save(webp_path, "WEBP", quality=WEBP_QUALITY, method=6)
            paths.append(webp_path)
        except (OSError, KeyError, ValueError):
            # Pillow sin soporte WebP → fallback silencioso a JPEG
            jpg_path = base_path.with_suffix(".jpg")
            img.save(jpg_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            paths.append(jpg_path)

    if fmt in ("jpeg", "both"):
        jpg_path = base_path.with_suffix(".jpg")
        if not jpg_path.exists():
            img.save(jpg_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            paths.append(jpg_path)

    return paths

# ─────────────────────────────────────────────────────────────────────
#  DESCARGA DE UNA EMPRESA
# ─────────────────────────────────────────────────────────────────────
def process_empresa(
    session: requests.Session,
    empresa: dict,
    folder: Path,
    fmt: str,
    dry_run: bool,
) -> dict:
    eid = empresa["id"]
    base = folder / safe_filename(eid)
    result = {
        "id": eid,
        "name": empresa["name"],
        "type": empresa["type"],
        "files": [],
        "source_url": None,
        "errors": [],
    }

    for url in empresa.get("urls", []):
        for attempt in range(1, RETRIES + 1):
            try:
                if dry_run:
                    log(f"[dry-run] {eid} -> {url}", "info")
                    result["source_url"] = url
                    return result

                raw = fetch_image_bytes(session, url)
                img = optimize_image(raw)
                files = save_optimized(img, base, fmt)
                result["files"] = [str(p) for p in files]
                result["source_url"] = url
                size_kb = sum(p.stat().st_size for p in files) // 1024
                log(f"{eid}  ←  {url}   ({img.width}x{img.height}, {size_kb} KB)", "ok")
                return result

            except Exception as ex:
                err = f"{url} (intento {attempt}): {ex}"
                if attempt == RETRIES:
                    result["errors"].append(err)
                    log(err, "err")
                else:
                    time.sleep(0.8 * attempt)

    return result

# ─────────────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Descarga y optimiza imágenes de transporte de La Libertad."
    )
    parser.add_argument(
        "--folder", type=Path, default=DEFAULT_FOLDER,
        help=f"Carpeta destino (default: {DEFAULT_FOLDER})",
    )
    parser.add_argument(
        "--json", type=Path, default=DEFAULT_JSON,
        help=f"Catálogo JSON (default: {DEFAULT_JSON})",
    )
    parser.add_argument(
        "--format", choices=["webp", "jpeg", "both"], default="webp",
        help="Formato de salida (default: webp)",
    )
    parser.add_argument("--only", help="Descargar solo esta empresa (por id)")
    parser.add_argument("--list", action="store_true", help="Listar ids disponibles")
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar qué haría")
    parser.add_argument("--no-overwrite", action="store_true",
                        help="No sobrescribir archivos existentes")
    args = parser.parse_args()

    try:
        catalog = load_catalog(args.json.expanduser().resolve())
    except (OSError, json.JSONDecodeError, ValueError) as ex:
        log(f"No se pudo cargar el catálogo JSON: {ex}", "err")
        return 1

    if args.list:
        print(f"{'ID':<28} NOMBRE")
        print("-" * 70)
        for e in catalog:
            print(f"{e['id']:<28} {e['name']}")
        return 0

    folder: Path = args.folder.expanduser().resolve()
    if not args.dry_run:
        folder.mkdir(parents=True, exist_ok=True)
    log(f"Carpeta destino: {folder}", "info")
    log(f"Formato: {args.format}", "info")

    targets = [e for e in catalog if not args.only or e["id"] == args.only]
    if not targets:
        log(f"No hay empresa con id '{args.only}'", "err")
        return 1

    # Saltar las que ya tienen archivo
    if args.no_overwrite:
        targets = [
            e for e in targets
            if not any((folder / f"{safe_filename(e['id'])}{ext}").exists()
                       for ext in (".webp", ".jpg"))
        ]
        log(f"Pendientes tras --no-overwrite: {len(targets)}", "info")

    session = requests.Session()
    manifest = []
    ok_count = 0
    fail_count = 0

    for idx, empresa in enumerate(targets, 1):
        log(f"[{idx}/{len(targets)}] {empresa['name']}", "info")
        res = process_empresa(session, empresa, folder, args.format, args.dry_run)
        manifest.append(res)
        if res["files"] or args.dry_run:
            ok_count += 1
        else:
            fail_count += 1
        time.sleep(0.4)  # cortesía con los servidores

    # Manifest final
    if not args.dry_run:
        manifest_path = folder / "manifest.json"
        manifest_path.write_text(
            json.dumps(
                {
                    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    "folder": str(folder),
                    "format": args.format,
                    "maxWidth": MAX_WIDTH,
                    "maxHeight": MAX_HEIGHT,
                    "empresas": manifest,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        log(f"Manifest guardado en {manifest_path}", "ok")

    print()
    log(f"Descargadas: {ok_count}   |   Fallidas: {fail_count}", 
        "ok" if fail_count == 0 else "warn")
    return 0 if fail_count == 0 else 2


if __name__ == "__main__":
    sys.exit(main())