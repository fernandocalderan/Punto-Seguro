# RETHEME_CSS_COLLISIONS - detección básica de colisiones CSS

Generado por: `scripts/retheme_css_collision_scan.sh`  
Fecha: 2026-03-05 10:07:28 +0100

Objetivo: identificar conflictos probables de orden/especificidad/inline styles antes del retheme.

## 1) Páginas P0 - carga CSS y riesgo

| Ruta | Archivo | CSS cargados (orden) | Inline `<style>` | Atributos `style=` | Riesgo | Mitigación sugerida |
|---|---|---|---:|---:|---|---|
| `/` | `index.html` | /css/ps-ui.css?v=1 /css/ps-tokens.css?v=1-/css/ps-components.css?v=1>/css/ps-pages/home.css?v=1 /css/compat.css?v=1 | 1 | 13 | Alta | Scope por body class + compat.css; mantener orden scripts/CSS y extraer inline gradualmente |
| `/diagnostico` | `evaluador.html` | /css/ps-ui.css?v=1 /css/ps-tokens.css?v=1-/css/ps-components.css?v=1>/css/ps-pages/diagnostico.css?v=1 /css/compat.css?v=1 | 1 | 3 | Alta | Scope por body class + compat.css; mantener orden scripts/CSS y extraer inline gradualmente |
| `/resultado` | `resultado.html` | styles/leads.css /css/ps-ui.css?v=1-/css/ps-tokens.css?v=1>/css/ps-components.css?v=1 /css/ps-pages/resultado.css?v=1 /css/compat.css?v=1 | 1 | 1 | Media-Alta | Scope por body class + compat.css; mantener orden scripts/CSS y extraer inline gradualmente |
| `/solicitar-propuesta` | `solicitar-propuesta.html` | styles/leads.css /css/ps-ui.css?v=1-/css/ps-tokens.css?v=1>/css/ps-components.css?v=1 /css/ps-pages/lead.css?v=1 /css/compat.css?v=1 | 1 | 6 | Media-Alta | Scope por body class + compat.css; mantener orden scripts/CSS y extraer inline gradualmente |
| `/confirmacion` | `confirmacion.html` | styles/leads.css /css/ps-ui.css?v=1-/css/ps-tokens.css?v=1>/css/ps-components.css?v=1 /css/ps-pages/lead.css?v=1 /css/compat.css?v=1 | 0 | 1 | Media-Alta | Scope por body class + compat.css; mantener orden scripts/CSS y extraer inline gradualmente |

## 2) Señales de colisión global (ps-ui.css vs leads.css)

| Métrica | ps-ui.css | leads.css | Riesgo |
|---|---:|---:|---|
| Reglas globales peligrosas (`*`, `body`, `a`, `.container`, etc.) | 52 | 23 | Alto si ambas hojas se cargan en la misma ruta |
| Uso de `!important` | 61 | 0 | Incrementa imprevisibilidad en overrides |
| Selectores con `#id` | 95 | 67 | Puede bloquear cambios de componentes |

Selectores comunes detectados en ambas hojas: .header .main

## 3) Recomendaciones de mitigación CSS

1. Aplicar scope por ruta con body class ('body.home-page', 'body.diagnostico-page', etc.).
2. Definir capas: 'ps-tokens.css' -> 'ps-components.css' -> 'ps-pages/*.css' -> 'compat.css'.
3. Mantener 'compat.css' para alias de clases legacy durante migración.
4. Evitar nuevos '!important'; usarlo solo para parche puntual documentado.
5. Migrar inline '<style>' de '/' y '/diagnostico' por fases para reducir colisiones.
