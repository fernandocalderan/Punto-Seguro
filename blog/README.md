# Blog Punto Seguro (generación automática)

Este blog es estático: los artículos se escriben en Markdown y se generan a HTML.

## Estructura

- `blog/content/posts/` → fuentes en `.md` (texto + metadatos)
- `blog/templates/` → plantilla HTML del artículo
- `blog/posts/` → salida generada (no editar a mano)
- `blog/build.py` → genera artículos y actualiza `blog.html`

## Cómo añadir un artículo nuevo (rápido)

Opción 1 (un comando):

`python3 blog/new_post.py "Título del artículo" portada_facebook.png`

Luego pega el texto en el `.md` creado y ejecuta:

`python3 blog/build.py`

Opción 2 (manual):

1) Crea un `.md` en `blog/content/posts/` y pega tu texto.
2) Opcionalmente añade al inicio una línea `# Título` y una imagen Markdown `![alt](ruta.png)`.
3) Ejecuta:

`python3 blog/build.py`

Eso:
- Genera/actualiza `blog/posts/<slug>.html`
- Actualiza automáticamente `blog.html` (grid + lecturas rápidas + enlace “Nuevo”)

## Sumario, tags y “más leídos”

El `blog.html` incluye un sumario lateral (estilo blog) generado automáticamente:

- **Destacados**: por defecto muestra los artículos más recientes.
- **Más leídos (manual)**: si quieres controlar el orden, añade `popular_rank: 1` (2, 3...) en el front matter de los artículos que quieras destacar.
- **Temas**: se generan a partir del campo `tag:` de cada artículo (también alimenta los chips superiores).
- **Filtro rápido**: buscar por texto y filtrar por tag funciona en el navegador (sin servidor).

## Formato del archivo `.md` (mínimo)

El front matter ahora es opcional. El generador completa automáticamente:

- `slug` (desde el nombre o el título)
- `date` (hoy, si no pones fecha)
- `read_time` (estimación por palabras)
- `excerpt` (primer párrafo)
- `quick_title` y `quick_summary`
- `conclusion` (usa la última línea con `👉`, si existe)

**Imágenes:** puedes ponerlas en la raíz (ej. `portada_facebook.png`) o dentro de `blog/` (ej. `blog/mi-imagen.png`).
Si pones solo el nombre del archivo y existe en `blog/`, el generador lo detecta automáticamente.

Ejemplo mínimo:

```
---
title: Título del artículo
tag: Accesos
image: portada_facebook.png
image_alt: Texto alternativo de la imagen
popular_rank: 1
---

## Subtítulo

Párrafos normales.

- Bullet 1
- Bullet 2
```

## Sin front matter (solo texto + imagen)

También puedes escribir así:

```
# Mi título

![Texto alternativo](portada_facebook.png)

Pega tu texto aquí.

👉 Frase final (opcional) para la conclusión.
```
