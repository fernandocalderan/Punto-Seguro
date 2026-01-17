#!/usr/bin/env python3
from __future__ import annotations

from datetime import date
from pathlib import Path
import re
import sys
import unicodedata


ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "blog" / "content" / "posts"
GOOGLE_TAG_SNIPPET = """  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4665672QWS"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-4665672QWS');
  </script>
"""


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text or "articulo"


def ensure_google_tag(path: Path) -> None:
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    if "googletagmanager.com/gtag/js?id=G-4665672QWS" in text:
        return
    marker = "<head>"
    idx = text.find(marker)
    if idx == -1:
        return
    insert_at = idx + len(marker)
    updated = text[:insert_at] + "\n" + GOOGLE_TAG_SNIPPET + text[insert_at:]
    path.write_text(updated, encoding="utf-8")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit('Uso: python3 blog/new_post.py "Título del artículo" [imagen.png]')

    title = sys.argv[1].strip()
    image = sys.argv[2].strip() if len(sys.argv) >= 3 else "portada_facebook.png"

    CONTENT_DIR.mkdir(parents=True, exist_ok=True)
    slug = slugify(title)

    existing = sorted(CONTENT_DIR.glob(f"*{slug}.md"))
    prefix = f"{len(list(CONTENT_DIR.glob('*.md'))) + 1:02d}"
    filename = f"{prefix}-{slug}.md"
    if existing:
        filename = f"{prefix}-{slug}-v2.md"

    path = CONTENT_DIR / filename
    today = date.today().isoformat()

    path.write_text(
        "\n".join(
            [
                "---",
                f"title: {title}",
                f"date: {today}",
                "tag: Blog",
                f"image: {image}",
                f"image_alt: {title}",
                "popular_rank: ",
                "---",
                "",
                "Pega aquí tu texto siguiendo la estructura Punto Seguro:",
                "",
                "# Introducción con impacto",
                "Explica percepción vs realidad del riesgo.",
                "",
                "## Cómo evalúa el intruso",
                "- accesos",
                "- rutinas",
                "- tiempos",
                "- reacción",
                "",
                "## Dónde aparece el riesgo real",
                "Contraste entre viviendas y negocios.",
                "",
                "## Checklist accionable",
                "- puntos a revisar",
                "",
                "## Conclusión",
                "👉 Una evaluación profesional no añade sistemas. Revela exposición real.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    ensure_google_tag(ROOT / "index.html")
    ensure_google_tag(ROOT / "blog" / "templates" / "post.html")

    print("OK")
    print(f"- Creado: {path}")
    print("- Siguiente: python3 blog/build.py")


if __name__ == "__main__":
    main()
