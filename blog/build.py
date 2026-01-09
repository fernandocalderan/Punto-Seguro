#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, List, Tuple
import html
import math
import unicodedata
import re


ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "blog" / "content" / "posts"
POSTS_OUT_DIR = ROOT / "blog" / "posts"
BLOG_INDEX_PATH = ROOT / "blog.html"
INDEX_PATH = ROOT / "index.html"


MONTHS_ES = {
    1: "ene",
    2: "feb",
    3: "mar",
    4: "abr",
    5: "may",
    6: "jun",
    7: "jul",
    8: "ago",
    9: "sep",
    10: "oct",
    11: "nov",
    12: "dic",
}


@dataclass(frozen=True)
class Post:
    title: str
    slug: str
    date_iso: str
    tag: str
    read_time: int
    popular_rank: int | None
    image: str
    image_alt: str
    excerpt: str
    quick_title: str
    quick_summary: str
    conclusion: str
    body_md: str

    @property
    def href(self) -> str:
        return f"blog/posts/{self.slug}.html"

    @property
    def date_human(self) -> str:
        year, month, day = (int(x) for x in self.date_iso.split("-"))
        return f"{day} {MONTHS_ES.get(month, str(month))} {year}"


def parse_front_matter(md: str) -> Tuple[Dict[str, str], str]:
    if not md.startswith("---"):
        return {}, md.lstrip("\n")
    parts = md.split("\n")
    if len(parts) < 3:
        raise ValueError("Front matter incompleto.")
    if parts[0].strip() != "---":
        raise ValueError("Front matter inválido.")

    meta: Dict[str, str] = {}
    i = 1
    while i < len(parts):
        line = parts[i]
        if line.strip() == "---":
            i += 1
            break
        if not line.strip():
            i += 1
            continue
        if ":" not in line:
            raise ValueError(f"Línea inválida en front matter: {line!r}")
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
        i += 1

    body = "\n".join(parts[i:]).lstrip("\n")
    return meta, body


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text or "articulo"


def strip_md(md: str) -> str:
    md = re.sub(r"^#{1,6}\s+", "", md, flags=re.M)
    md = re.sub(r"!\[(.*?)\]\((.*?)\)", r"\1", md)
    md = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", md)
    md = md.replace("👉", " ")
    md = re.sub(r"[`*_>#]", " ", md)
    md = re.sub(r"\s+", " ", md).strip()
    return md


def estimate_read_time_minutes(md: str) -> int:
    words = len(strip_md(md).split())
    return max(3, int(math.ceil(words / 220))) if words else 3


def first_image(md: str) -> Tuple[str, str] | None:
    m = re.search(r"!\[(.*?)\]\((.*?)\)", md)
    if not m:
        return None
    alt = (m.group(1) or "").strip()
    path = (m.group(2) or "").strip()
    if path.startswith("./"):
        path = path[2:]
    return path, alt


def normalize_image_path(image: str) -> str:
    image = (image or "").strip()
    if not image or image.startswith(("http://", "https://")):
        return image

    image = image.lstrip("./")
    candidate = (ROOT / image).resolve()
    if candidate.exists():
        return image

    if "/" not in image:
        candidate_blog = (ROOT / "blog" / image).resolve()
        if candidate_blog.exists():
            return f"blog/{image}"

    return image


def extract_title_from_md(md: str) -> Tuple[str | None, str]:
    lines = md.splitlines()
    for idx, line in enumerate(lines):
        m = re.match(r"^\s*#\s+(.+?)\s*$", line)
        if m:
            title = m.group(1).strip()
            new_lines = lines[:idx] + lines[idx + 1 :]
            return title, "\n".join(new_lines).lstrip("\n")
    return None, md


def compute_excerpt(md: str, max_len: int = 160) -> str:
    lines = md.splitlines()
    buff: List[str] = []
    for line in lines:
        line = line.strip()
        if not line:
            if buff:
                break
            continue
        if line.startswith("#"):
            continue
        if line.startswith("- "):
            continue
        if line.startswith("![](") or line.startswith("!["):
            continue
        buff.append(line)
    text = strip_md(" ".join(buff))
    if not text:
        text = strip_md(md)
    text = text[: max_len + 1].strip()
    if len(text) > max_len:
        text = text[:max_len].rstrip() + "…"
    return text


def compute_quick_title(title: str, max_len: int = 48) -> str:
    t = re.split(r"[:(–-]", title, maxsplit=1)[0].strip()
    if len(t) > max_len:
        t = t[:max_len].rstrip() + "…"
    return t


def compute_quick_summary(excerpt: str, max_len: int = 120) -> str:
    t = excerpt[: max_len + 1].strip()
    if len(t) > max_len:
        t = t[:max_len].rstrip() + "…"
    return t


def compute_conclusion(md: str) -> str:
    for line in reversed(md.splitlines()):
        line = line.strip()
        if not line:
            continue
        if line.startswith("👉"):
            line = line.lstrip("👉").strip()
            return strip_md(line)[:180] or "Contrastar el riesgo aporta claridad para decidir."
    return "Contrastar el riesgo aporta claridad para decidir."


def md_to_html(md: str) -> str:
    lines = md.splitlines()
    out: List[str] = []
    i = 0
    in_list = False

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    def inline_format(text: str) -> str:
        text = html.escape(text)
        text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
        text = re.sub(r"_(.+?)_", r"<i>\1</i>", text)
        return text

    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            close_list()
            i += 1
            continue

        if line.startswith(">"):
            close_list()
            quote = inline_format(line[1:].strip())
            out.append(f"<div class=\"quote\">{quote}</div>")
            i += 1
            continue

        if line.startswith("## "):
            close_list()
            out.append(f"<h3>{inline_format(line[3:].strip())}</h3>")
            i += 1
            continue

        if line.startswith("### "):
            close_list()
            out.append(f"<h4>{inline_format(line[4:].strip())}</h4>")
            i += 1
            continue

        if line.startswith("- "):
            if not in_list:
                out.append("<ul class=\"checklist\">")
                in_list = True
            item = inline_format(line[2:].strip())
            out.append(f"<li><span class=\"check\">✓</span><span>{item}</span></li>")
            i += 1
            continue

        close_list()
        out.append(f"<p>{inline_format(line.strip())}</p>")
        i += 1

    close_list()
    return "\n        ".join(out)


def read_post(md_path: Path) -> Post:
    raw = md_path.read_text(encoding="utf-8")
    meta, body = parse_front_matter(raw)
    title_from_body, body = extract_title_from_md(body)

    if meta.get("draft", "").strip().lower() in {"1", "true", "yes", "y"}:
        raise ValueError(f"{md_path}: draft=true (omite o cambia a false para publicar)")

    title = (meta.get("title") or title_from_body or "").strip()
    if not title:
        raise ValueError(f"{md_path}: falta title (en front matter o como '# Título' al inicio).")

    slug = (meta.get("slug") or md_path.stem or slugify(title)).strip()
    slug = slugify(slug)

    date_iso = (meta.get("date") or "").strip()
    if date_iso:
        date.fromisoformat(date_iso)
    else:
        date_iso = date.today().isoformat()

    tag = (meta.get("tag") or "Blog").strip()
    popular_rank = None
    if meta.get("popular_rank"):
        try:
            popular_rank = int(meta["popular_rank"])
        except ValueError as e:
            raise ValueError(f"{md_path}: popular_rank debe ser un entero (1,2,3...).") from e
        if popular_rank < 1:
            raise ValueError(f"{md_path}: popular_rank debe ser >= 1.")

    image = normalize_image_path(meta.get("image") or "")
    image_alt = (meta.get("image_alt") or "").strip()
    img = first_image(body)
    if not image and img:
        image = normalize_image_path(img[0])
        image_alt = image_alt or img[1]
    image = image or "portada_facebook.png"
    image_alt = image_alt or title

    excerpt = (meta.get("excerpt") or "").strip() or compute_excerpt(body)
    quick_title = (meta.get("quick_title") or "").strip() or compute_quick_title(title)
    quick_summary = (meta.get("quick_summary") or "").strip() or compute_quick_summary(excerpt)
    conclusion = (meta.get("conclusion") or "").strip() or compute_conclusion(body)
    read_time = int(meta["read_time"]) if meta.get("read_time") else estimate_read_time_minutes(body)

    return Post(
        title=title,
        slug=slug,
        date_iso=date_iso,
        tag=tag,
        read_time=read_time,
        popular_rank=popular_rank,
        image=image,
        image_alt=image_alt,
        excerpt=excerpt,
        quick_title=quick_title,
        quick_summary=quick_summary,
        conclusion=conclusion,
        body_md=body,
    )


def rel_image_for_post(image_path: str, prefix: str) -> str:
    if image_path.startswith(("http://", "https://")):
        return image_path
    normalized = image_path.lstrip("/")
    return f"{prefix}{normalized}" if normalized else image_path


def prefix_relative_urls(base_html: str, prefix: str) -> str:
    if not prefix:
        return base_html

    attr_re = re.compile(
        r"(?P<attr>\b(?:href|src)\s*=\s*[\"'])(?P<url>[^\"']+)(?P<end>[\"'])",
        re.IGNORECASE,
    )

    def needs_prefix(url: str) -> bool:
        return not url.startswith(
            ("#", "http://", "https://", "mailto:", "tel:", "data:", "/")
        )

    def apply_prefix(url: str) -> str:
        if not needs_prefix(url) or url.startswith(prefix) or url.startswith("../"):
            return url
        normalized = url[2:] if url.startswith("./") else url
        base = normalized
        suffix = ""
        for sep in ("#", "?"):
            if sep in base:
                base, rest = base.split(sep, 1)
                suffix = sep + rest
                break
        if not base:
            return url
        return f"{prefix}{base}{suffix}"

    def repl(match: re.Match[str]) -> str:
        url = match.group("url")
        updated = apply_prefix(url)
        if updated == url:
            return match.group(0)
        return f"{match.group('attr')}{updated}{match.group('end')}"

    return attr_re.sub(repl, base_html)


def build_page(content_html: str, *, path_prefix: str = "") -> str:
    base = INDEX_PATH.read_text(encoding="utf-8")
    base = prefix_relative_urls(base, path_prefix)
    pattern = re.compile(r"(<main id=\"main\">)(.*?)(</main>)", re.DOTALL)
    if not pattern.search(base):
        raise ValueError("No se encontró <main id=\"main\"> en index.html")
    return pattern.sub(
        lambda match: f"{match.group(1)}\n{content_html}\n{match.group(3)}",
        base,
        count=1,
    )


def expert_invite_block(asset_prefix: str = "") -> str:
    return f"""
    <section class="expert-invite">

      <p class="expert-invite-intro">
        Si necesitas contrastar si tu vivienda, local u oficina
        está correctamente protegida,
        puedes hablar directamente conmigo.
      </p>

      <a
        href="https://wa.me/34XXXXXXXXX?text=Hola,%20quiero%20hablar%20contigo%20sobre%20mi%20situación"
        class="expert-invite-action"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src="{asset_prefix}logo_whatsapp.png" alt="WhatsApp">
        <span>Hablar por WhatsApp</span>
      </a>

      <p class="expert-invite-note">
        Conversación directa · Sin formularios · Sin compromiso<br>
        Resolver una duda a tiempo evita decisiones equivocadas después.
      </p>

    </section>
    """.strip()


def render_post_content(post: Post, asset_prefix: str = "") -> str:
    hero_image = ""
    if post.image.strip():
        hero_image = (
            f"<div class=\"hero-claim\">\n"
            f"  <img src=\"{html.escape(rel_image_for_post(post.image, asset_prefix))}\" alt=\"{html.escape(post.image_alt)}\">\n"
            f"</div>"
        )

    content_html = md_to_html(post.body_md)
    conclusion_html = f"<div class=\"quote\">{html.escape(post.conclusion)}</div>"

    return f"""
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <h1>{html.escape(post.title)}</h1>
          <p class="hero-subtitle">{html.escape(post.excerpt)}</p>
          <p class="fineprint">{html.escape(post.tag)} · {html.escape(post.date_human)} · {post.read_time} min</p>
        </div>
      </div>
    </section>

    <section>
      <div class="container">
        <div class="hero-panel">
          {hero_image}
          {content_html}
          {conclusion_html}
        </div>
      </div>
    </section>

    {expert_invite_block(asset_prefix)}
    """.strip()


def render_blog_cards(posts: List[Post]) -> str:
    chunks: List[str] = []
    for post in posts:
        image_html = ""
        if post.image:
            image_html = (
                f"<img src=\"{html.escape(post.image)}\" alt=\"{html.escape(post.image_alt)}\">"
            )
        chunks.append(
            "\n".join(
                [
                    f"<a class=\"card\" href=\"{post.href}\">",
                    f"  {image_html}" if image_html else "  ",
                    f"  <h3>{html.escape(post.title)}</h3>",
                    f"  <p>{html.escape(post.excerpt)}</p>",
                    f"  <p class=\"fineprint\">{html.escape(post.tag)} · {html.escape(post.date_human)} · {post.read_time} min</p>",
                    "</a>",
                ]
            )
        )
    return "\n".join(chunks)


def render_blog_content(posts_sorted: List[Post]) -> str:
    cards_html = render_blog_cards(posts_sorted)
    intro = (
        "Criterio aplicado a casos reales para entender exposición, rutina y puntos ignorados."
    )

    return f"""
    <section class=\"hero\">
      <div class=\"container hero-grid\">
        <div>
          <h1>Blog Punto Seguro</h1>
          <p class=\"hero-subtitle\">{html.escape(intro)}</p>
        </div>
      </div>
    </section>

    <section>
      <div class=\"container\">
        <div class=\"section-title\">
          <h2>Últimas publicaciones</h2>
          <p>Lecturas breves para detectar exposición real y evitar decisiones basadas en percepciones.</p>
        </div>
        <div class=\"grid\">
          {cards_html}
        </div>
      </div>
    </section>

    {expert_invite_block()}
    """.strip()


def main() -> None:
    if not CONTENT_DIR.exists():
        raise SystemExit(f"No existe {CONTENT_DIR}")
    POSTS_OUT_DIR.mkdir(parents=True, exist_ok=True)

    posts: List[Post] = []
    for md_path in sorted(CONTENT_DIR.glob("*.md")):
        try:
            posts.append(read_post(md_path))
        except ValueError as e:
            msg = str(e)
            if "draft=true" in msg:
                continue
            raise

    posts_sorted = sorted(posts, key=lambda p: (p.date_iso, p.slug), reverse=True)

    for post in posts_sorted:
        out_path = POSTS_OUT_DIR / f"{post.slug}.html"
        out_html = build_page(render_post_content(post, asset_prefix="../../"), path_prefix="../../")
        out_path.write_text(out_html, encoding="utf-8")

    blog_html_updated = build_page(render_blog_content(posts_sorted))
    BLOG_INDEX_PATH.write_text(blog_html_updated, encoding="utf-8")

    print("OK")
    print(f"- Posts generados: {len(posts_sorted)}")
    print(f"- Actualizado: {BLOG_INDEX_PATH}")


if __name__ == "__main__":
    main()
