#!/usr/bin/env python3
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, List, Tuple
from urllib.parse import urldefrag
import html
import math
import unicodedata
import re


ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "blog" / "content" / "posts"
POSTS_OUT_DIR = ROOT / "blog" / "posts"
TEMPLATE_PATH = ROOT / "blog" / "templates" / "post.html"
BLOG_INDEX_PATH = ROOT / "blog.html"

POSTS_MARKER_START = "<!-- BLOG:POSTS_START -->"
POSTS_MARKER_END = "<!-- BLOG:POSTS_END -->"
QUICK_MARKER_START = "<!-- BLOG:QUICKREADS_START -->"
QUICK_MARKER_END = "<!-- BLOG:QUICKREADS_END -->"
NEW_MARKER_START = "<!-- BLOG:NEWLINK_START -->"
NEW_MARKER_END = "<!-- BLOG:NEWLINK_END -->"
SIDEBAR_MARKER_START = "<!-- BLOG:SIDEBAR_START -->"
SIDEBAR_MARKER_END = "<!-- BLOG:SIDEBAR_END -->"


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
            return strip_md(line)[:180] or "Evaluar el riesgo aporta claridad para decidir."
    return "Evaluar el riesgo aporta claridad para decidir."


def md_to_html(md: str) -> str:
    lines = md.splitlines()
    out: List[str] = []
    i = 0
    in_list = False

    def close_list():
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

        if line.startswith("## "):
            close_list()
            out.append(f"<h2>{inline_format(line[3:].strip())}</h2>")
            i += 1
            continue

        if line.startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{inline_format(line[2:].strip())}</li>")
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


def apply_template(template: str, mapping: Dict[str, str]) -> str:
    out = template
    for k, v in mapping.items():
        out = out.replace(f"{{{{{k}}}}}", v)
    return out


def ensure_markers(text: str, start: str, end: str) -> None:
    if start not in text or end not in text:
        raise ValueError(f"Faltan marcadores {start} / {end} en blog.html")


def replace_between(text: str, start: str, end: str, replacement: str) -> str:
    ensure_markers(text, start, end)
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    return pattern.sub(start + "\n" + replacement + "\n" + end, text, count=1)


def rel_image_for_post(image_path: str) -> str:
    if image_path.startswith(("http://", "https://")):
        return image_path
    return "../../" + image_path.lstrip("/")


def render_post_html(post: Post, template: str) -> str:
    hero_image = ""
    if post.image.strip():
        hero_image = (
            '<figure class="hero-image">'
            f'<img src="{html.escape(rel_image_for_post(post.image))}" alt="{html.escape(post.image_alt)}" loading="lazy" />'
            "</figure>"
        )

    content_html = md_to_html(post.body_md)

    mapping = {
        "PAGE_TITLE": html.escape(f"Punto Seguro | {post.title}"),
        "META_DESCRIPTION": html.escape(post.excerpt),
        "BREADCRUMB": html.escape(post.quick_title),
        "TITLE": html.escape(post.title),
        "TAG": html.escape(post.tag),
        "DATE_ISO": html.escape(post.date_iso),
        "DATE_HUMAN": html.escape(post.date_human),
        "READ_TIME": str(post.read_time),
        "HERO_IMAGE": hero_image,
        "CONTENT": content_html,
        "CONCLUSION": html.escape(post.conclusion),
    }
    return apply_template(template, mapping)


def render_blog_cards(posts: List[Post]) -> str:
    chunks: List[str] = []
    for post in posts:
        title_attr = html.escape(post.title, quote=True)
        excerpt_attr = html.escape(post.excerpt, quote=True)
        tag_attr = html.escape(post.tag, quote=True)
        chunks.append(
            f'''          <article class="blog-card" data-title="{title_attr}" data-excerpt="{excerpt_attr}" data-tag="{tag_attr}">
            <a href="{post.href}" aria-label="Leer: {html.escape(post.title)}">
              <figure class="blog-card-media">
                <img src="{html.escape(post.image)}" alt="{html.escape(post.image_alt)}" loading="lazy" />
                <span class="blog-card-tag">{html.escape(post.tag)}</span>
              </figure>
              <div class="blog-card-body">
                <h3 class="blog-card-title">{html.escape(post.title)}</h3>
                <p class="blog-card-summary">{html.escape(post.excerpt)}</p>
                <div class="blog-card-meta">
                  <time datetime="{html.escape(post.date_iso)}">{html.escape(post.date_human)}</time>
                  <span>{post.read_time} min lectura</span>
                </div>
              </div>
            </a>
          </article>'''
        )
    return "\n".join(chunks)


def render_quickreads(posts: List[Post], limit: int = 3) -> str:
    chunks: List[str] = []
    for post in posts[:limit]:
        chunks.append(
            f'''          <details>
            <summary>{html.escape(post.quick_title)}</summary>
            <p>{html.escape(post.quick_summary)}</p>
            <p><a href="{post.href}">Leer artículo completo</a> · <a href="index_compliance.html#formulario">Solicitar evaluación</a></p>
          </details>'''
        )
    return "\n".join(chunks)

def render_sidebar(posts_sorted: List[Post]) -> str:
    popular = [p for p in posts_sorted if p.popular_rank is not None]
    if popular:
        popular_sorted = sorted(popular, key=lambda p: (p.popular_rank or 999999, p.date_iso, p.slug))
        featured = popular_sorted[:3]
        featured_title = "Más leídos"
        featured_note = "Orden manual."
    else:
        featured = posts_sorted[:3]
        featured_title = "Destacados"
        featured_note = "Sin métricas públicas."

    tag_counts: Dict[str, int] = {}
    for p in posts_sorted:
        tag_counts[p.tag] = tag_counts.get(p.tag, 0) + 1
    tags_sorted = sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))

    featured_items: List[str] = []
    for p in featured:
        featured_items.append(
            f'''                  <li>
                    <a href="{p.href}">
                      <span class="hero-strip-link-title">{html.escape(p.quick_title)}</span>
                      <span class="hero-strip-link-meta">{html.escape(p.tag)} · {p.read_time} min</span>
                    </a>
                  </li>'''
        )

    tags_items: List[str] = []
    for tag, _ in tags_sorted[:8]:
        tags_items.append(
            f'''                <button type="button" class="hero-strip-tag" data-tag="{html.escape(tag, quote=True)}" aria-pressed="false">{html.escape(tag)}</button>'''
        )

    return f"""
            <div class="hero-strip-inner">
              <div>
                <div class="hero-strip-head">
                  <span class="hero-strip-title">{featured_title}</span>
                  <button type="button" class="hero-strip-clear" data-clear-filters>Ver todo</button>
                </div>
                <ul class="hero-strip-links" aria-label="{featured_title}">
{chr(10).join(featured_items)}
                </ul>
                <div class="hero-strip-note">{featured_note}</div>
              </div>
              <div>
                <div class="hero-strip-head">
                  <span class="hero-strip-title">Temas</span>
                </div>
                <div class="hero-strip-tags" aria-label="Filtrar por tema">
{chr(10).join(tags_items)}
                </div>
              </div>
            </div>
""".strip("\n")


def update_blog_html(blog_html: str, posts_sorted: List[Post]) -> str:
    cards_html = render_blog_cards(posts_sorted)
    quick_html = render_quickreads(posts_sorted, limit=3)
    sidebar_html = render_sidebar(posts_sorted)

    new_post = posts_sorted[0]
    new_link_html = (
        f'<a class="btn btn-ghost" href="{new_post.href}" '
        f'aria-label="Leer el artículo: {html.escape(new_post.title)}">'
        f'Nuevo: {html.escape(new_post.quick_title.lower())}</a>'
    )

    blog_html = replace_between(blog_html, POSTS_MARKER_START, POSTS_MARKER_END, cards_html)
    blog_html = replace_between(blog_html, QUICK_MARKER_START, QUICK_MARKER_END, quick_html)
    blog_html = replace_between(blog_html, NEW_MARKER_START, NEW_MARKER_END, new_link_html)
    blog_html = replace_between(blog_html, SIDEBAR_MARKER_START, SIDEBAR_MARKER_END, sidebar_html)
    return blog_html


def main() -> None:
    if not CONTENT_DIR.exists():
        raise SystemExit(f"No existe {CONTENT_DIR}")
    POSTS_OUT_DIR.mkdir(parents=True, exist_ok=True)

    template = TEMPLATE_PATH.read_text(encoding="utf-8")

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
        out_html = render_post_html(post, template)
        out_path.write_text(out_html, encoding="utf-8")

    blog_html = BLOG_INDEX_PATH.read_text(encoding="utf-8")
    blog_html_updated = update_blog_html(blog_html, posts_sorted)
    BLOG_INDEX_PATH.write_text(blog_html_updated, encoding="utf-8")

    print("OK")
    print(f"- Posts generados: {len(posts_sorted)}")
    print(f"- Actualizado: {BLOG_INDEX_PATH}")


if __name__ == "__main__":
    main()
