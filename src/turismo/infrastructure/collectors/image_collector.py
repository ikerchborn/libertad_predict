"""Royalty-free, self-hosted and optimized WebP image pipeline for Turismo La Libertad.

Enforces:
1. Zero Google Photos (no maps.googleapis.com / lh3.googleusercontent.com).
2. Multi-tier free image cascade:
   - Tier 1: Wikimedia Commons API / Wikidata (CC0, CC BY, CC BY-SA with automatic ATTRIBUTION.md).
   - Tier 2: OpenGraph / JSON-LD thumbnail from official website if registered.
   - Tier 3: Aesthetic categorized local fallback (default_attraction, default_lodging, etc.).
3. Pillow compression: max width 800px, WebP format, quality=78, method=6 (35 KB - 70 KB).
4. Local storage: frontend/public/images/places/place_{id}.webp.
"""
from __future__ import annotations

import io
import logging
import re
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote_plus

import httpx
from PIL import Image

from turismo.domain.models import PlaceKind, RunResult
from turismo.infrastructure.collectors.base import BaseCollector

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from turismo.infrastructure.db.repositories import PlaceRepo, ScrapeRunRepo

PUBLIC_IMAGES_DIR = Path("frontend/public/images/places")
DEFAULTS_DIR = Path("frontend/public/images/defaults")
ATTRIBUTION_FILE = Path("ATTRIBUTION.md")

COMMONS_USER_AGENT = (
    "TurismoLaLibertad/1.0 (info@turismolalibertad.pe; educational tourism project)"
)


def optimize_and_save_webp(image_bytes: bytes, dest_path: Path, max_width: int = 800) -> bool:
    """Resize to max_width and compress to WebP quality=78 method=6."""
    try:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        if img.width > max_width:
            ratio = max_width / float(img.width)
            new_height = int(float(img.height) * ratio)
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
        img.save(dest_path, "WEBP", quality=78, method=6)
        return True
    except Exception as exc:
        logger.debug("Failed to optimize image for %s: %s", dest_path, exc)
        return False


def copy_category_default(kind: PlaceKind, dest_path: Path) -> bool:
    """Generate or copy aesthetic category fallback image."""
    default_name = f"default_{kind.value}.webp"
    source_default = DEFAULTS_DIR / default_name
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    if source_default.exists():
        dest_path.write_bytes(source_default.read_bytes())
        return True

    # Fallback to creating a solid branded image if default file doesn't exist yet
    img = Image.new("RGB", (800, 533), color=(40, 55, 75))
    img.save(dest_path, "WEBP", quality=78, method=6)
    return True


async def fetch_wikimedia_commons_image(
    client: httpx.AsyncClient,
    place_name: str,
    lat: float,
    lon: float,
) -> tuple[bytes, dict[str, str]] | None:
    """Search Wikimedia Commons for CC/Public Domain image strictly matching place name."""
    headers = {"User-Agent": COMMONS_USER_AGENT}
    clean_name = re.sub(r"[^\w\s]", " ", place_name).strip()
    distinctive_tokens = {
        w.lower()
        for w in clean_name.split()
        if len(w) > 3
        and w.lower() not in {"hotel", "hostal", "restaurant", "restaurante", "valle", "calle"}
    }

    search_query = quote_plus(f"{clean_name} Trujillo")
    search_url = (
        "https://commons.wikimedia.org/w/api.php?action=query"
        f"&generator=search&gsrsearch={search_query}&gsrnamespace=6"
        "&prop=imageinfo&iiprop=url|size|mime|extmetadata"
        "&format=json"
    )
    try:
        resp = await client.get(search_url, headers=headers, timeout=8.0)
        if resp.status_code == 200:
            data = resp.json()
            pages = data.get("query", {}).get("pages", {})
            for _, p in pages.items():
                title = p.get("title", "").lower()
                # Strict matching: if distinctive tokens exist, require at least one match in title
                if distinctive_tokens and not any(t in title for t in distinctive_tokens):
                    continue

                info = p.get("imageinfo", [{}])[0]
                img_url = info.get("url")
                meta = info.get("extmetadata", {})
                lic = meta.get("LicenseShortName", {}).get("value", "")
                artist = meta.get("Artist", {}).get("value", "Wikimedia Commons")
                clean_artist = re.sub(r"<[^>]+>", "", artist).strip() or "Wikimedia Commons"

                lic_upper = lic.upper()
                if (
                    img_url
                    and any(ok in lic_upper for ok in ["CC", "PUBLIC DOMAIN", "PD", "GPL"])
                    and not any(bad in lic_upper for bad in ["NONCOMMERCIAL", "NC", "ND"])
                ):
                    img_resp = await client.get(img_url, headers=headers, timeout=10.0)
                    if img_resp.status_code == 200 and len(img_resp.content) > 2000:
                        return img_resp.content, {
                            "title": p.get("title", "Wikimedia"),
                            "license": lic,
                            "author": clean_artist[:100],
                            "url": img_url,
                        }
    except Exception as exc:
        logger.debug("Wikimedia text search failed for %s: %s", place_name, exc)

    return None


async def fetch_opengraph_image(
    client: httpx.AsyncClient,
    website_url: str,
) -> bytes | None:
    """Fetch OpenGraph or schema.org image from official business website."""
    try:
        resp = await client.get(
            website_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; TurismoBot/1.0)"},
            follow_redirects=True,
            timeout=8.0,
        )
        if resp.status_code != 200:
            return None

        html = resp.text
        # Look for og:image or twitter:image
        match = re.search(
            r'<meta[^>]+property=[\'"]og:image[\'"][^>]+content=[\'"]([^\'"]+)[\'"]',
            html,
            re.IGNORECASE,
        )
        if not match:
            match = re.search(
                r'<meta[^>]+content=[\'"]([^\'"]+)[\'"][^>]+property=[\'"]og:image[\'"]',
                html,
                re.IGNORECASE,
            )
        if not match:
            match = re.search(
                r'<meta[^>]+name=[\'"]twitter:image[\'"][^>]+content=[\'"]([^\'"]+)[\'"]',
                html,
                re.IGNORECASE,
            )

        if match:
            img_url = match.group(1).strip()
            if img_url.startswith("//"):
                img_url = f"https:{img_url}"
            elif img_url.startswith("/"):
                from urllib.parse import urljoin
                img_url = urljoin(website_url, img_url)

            img_resp = await client.get(img_url, follow_redirects=True, timeout=8.0)
            if img_resp.status_code == 200 and len(img_resp.content) > 2000:
                return img_resp.content
    except Exception as exc:
        logger.debug("OpenGraph lookup failed for %s: %s", website_url, exc)
    return None


class ImageCollector(BaseCollector):
    name = "image_collector"

    def __init__(
        self,
        place_repo: PlaceRepo,
        scrape_repo: ScrapeRunRepo,
        output_dir: Path = PUBLIC_IMAGES_DIR,
    ) -> None:
        super().__init__(scrape_repo)
        self._place_repo = place_repo
        self._output_dir = output_dir

    async def _run_impl(self) -> RunResult:
        places = self._place_repo.list_all(include_unclassified=False)
        self._output_dir.mkdir(parents=True, exist_ok=True)
        DEFAULTS_DIR.mkdir(parents=True, exist_ok=True)

        attributions: list[dict[str, str]] = []
        total_processed = 0

        async with httpx.AsyncClient() as client:
            for p in places:
                if p.id is None:
                    continue

                dest_file = self._output_dir / f"place_{p.id}.webp"
                local_url = f"/images/places/place_{p.id}.webp"
                local_path_str = str(dest_file).replace("\\", "/")

                # If already exists and valid on disk, simply ensure DB points to it
                if dest_file.exists() and dest_file.stat().st_size > 500:
                    detail = self._place_repo.get_place_detail(p.id)
                    if detail and (
                        detail.image_url != local_url
                        or detail.local_image_path != local_path_str
                    ):
                        updated = detail.model_copy(
                            update={
                                "image_url": local_url,
                                "local_image_path": local_path_str,
                            }
                        )
                        self._place_repo.upsert_place_detail(updated)
                    total_processed += 1
                    continue

                detail = self._place_repo.get_place_detail(p.id)
                saved = False

                # 1. Wikimedia Commons lookup (especially for attractions and major sites)
                if p.kind == PlaceKind.ATTRACTION:
                    wm_res = await fetch_wikimedia_commons_image(client, p.name, p.lat, p.lon)
                    if wm_res is not None:
                        img_bytes, attr = wm_res
                        if optimize_and_save_webp(img_bytes, dest_file):
                            saved = True
                            attributions.append({
                                "file": f"place_{p.id}.webp",
                                "name": p.name,
                                **attr,
                            })

                # 2. OpenGraph from official website
                if not saved and detail and detail.website:
                    og_bytes = await fetch_opengraph_image(client, detail.website)
                    if og_bytes is not None:
                        saved = optimize_and_save_webp(og_bytes, dest_file)

                # 3. Categorized aesthetic fallback
                if not saved:
                    copy_category_default(p.kind, dest_file)

                # Update place_details in database
                if detail:
                    updated = detail.model_copy(
                        update={
                            "image_url": local_url,
                            "local_image_path": local_path_str,
                        }
                    )
                    self._place_repo.upsert_place_detail(updated)
                total_processed += 1

        # Record attributions in ATTRIBUTION.md
        if attributions:
            self._update_attribution_file(attributions)

        return RunResult(
            collector=self.name,
            rows_upserted=total_processed,
            rows_rejected=0,
            status="ok",
        )

    def _update_attribution_file(self, new_attributions: list[dict[str, str]]) -> None:
        try:
            content = ""
            if ATTRIBUTION_FILE.exists():
                content = ATTRIBUTION_FILE.read_text(encoding="utf-8")
            else:
                content = (
                    "# Atribución de Imágenes Wikimedia Commons\n\n"
                    "Fotografías bajo licencias Creative Commons y Dominio Público:\n\n"
                )

            for a in new_attributions:
                entry = (
                    f"- **{a['file']}** ({a.get('name', 'Lugar')} - {a.get('title', '')})\n"
                    f"  - **Licencia:** {a.get('license', 'CC')}\n"
                    f"  - **Autor:** {a.get('author', 'Desconocido')}\n"
                    f"  - **Fuente:** {a.get('url', '')}\n\n"
                )
                if a["file"] not in content:
                    content += entry

            ATTRIBUTION_FILE.write_text(content, encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to update ATTRIBUTION.md: %s", exc)
