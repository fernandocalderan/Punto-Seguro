# RETHEME_FIX_PLAN - plan de mitigación previo al retheme

Fecha: 2026-03-05  
Rama: `diagnostic/retheme-risk-hunt`  
Base documental: `docs/NO_TOCAR.md`, `docs/RETHEME_RISKS.md`, `docs/RETHEME_CSS_COLLISIONS.md`, `docs/SMOKE_P0.md`

## 1) Estado baseline

- `scripts/audit_p0.sh`: **PASS** en `http://localhost:3000` para `/`, `/diagnostico`, `/resultado`, `/solicitar-propuesta`, `/confirmacion`.
- Contratos P0 detectados por scanner (DOM/storage/API/tracking): presentes.
- Riesgo principal no es backend/API; es **acoplamiento de DOM + cascada CSS** en funnel y admin.

## 2) Top 10 fallos probables (prioridad P0)

| # | Fallo probable | Contrato en riesgo | Severidad | Probabilidad | Solución preferida |
|---|---|---|---|---|---|
| 1 | CTA Home deja de disparar tracking o navegación | `#hero-primary-cta`, `.ps-cta-primary`, `data-ps-placement` | Alta | Alta | Mantener ID/clases legacy + alias en markup nuevo |
| 2 | Banner restore deja de mostrarse | `#eval-restore-banner`, key `puntoSeguro.latestEvaluation` | Alta | Media-Alta | Mantener ID y estructura mínima del banner |
| 3 | Diagnóstico no calcula o no cambia formulario | `#evaluador-form`, `#tipo-inmueble`, `#formulario-*`, handlers inline | Alta | Alta | Mantener IDs + handlers; ocultar pero no eliminar nodos legacy |
| 4 | IEI engine no encuentra preguntas | `select[data-qid]`, `#iei-vivienda-root`, `#iei-comercio-root` | Alta | Alta | Mantener selects legacy (aunque visualmente custom) |
| 5 | Resultado no renderiza CTA/factores | `#risk-score`, `#risk-level-badge`, `#cta-request`, `#cta-keep` | Alta | Media-Alta | No renombrar IDs; adaptar layout alrededor |
| 6 | Form lead rompe payload o validación | `#lead-form`, `name/id` de `name/phone/email/postal_code` | Alta | Alta | Mantener `id` y `name` exactos; alias visual en HTML |
| 7 | OTP modal queda tapado o inutilizable en móvil | `#ps-otp-overlay`, `.otp-digit`, `#ps-otp-*` + sticky/header z-index | Alta | Media-Alta | Parche de capas en `compat.css` (z-index/inset/focus) |
| 8 | Eventos CTA/funnel incompletos | `data-ps-placement`, `data-ps-segment`, `.ps-sticky-cta`, `analytics` | Alta | Media | Mantener attrs/clases legacy como alias en nuevo markup |
| 9 | Orden CSS/JS cambia y aparecen regresiones | orden scripts P0 congelado + mezcla `leads.css`/`ps-ui.css` | Alta | Media-Alta | Respetar orden actual y añadir capa `compat.css` al final |
| 10 | Retheme impacta admin (tablas/modales) | IDs admin + `.ps-modal`, `.container`, `.header` globales | Media-Alta | Alta | Aislar admin del retheme global (scope por body/ruta) |

## 3) Parches mínimos propuestos (no aplicados)

## 3.1 Home CTA + tracking (`/index.html`, `/js/ps-cta.js`)

Archivo objetivo: `index.html`  
Fragmento mínimo a preservar en markup retheme:

```html
<a id="hero-primary-cta"
   class="ps-cta-primary ps-cta-hero"
   href="/diagnostico"
   data-ps-placement="inline"
   aria-label="Calcular mi Índice IEI™">
  Calcular mi Índice IEI™
</a>
```

Archivo objetivo: `css/compat.css`  
Fragmento sugerido (alias visual sin tocar JS):

```css
/* Mantiene contrato de tracking de js/ps-cta.js */
a.ps-cta-primary,
a.ps-sticky-cta,
button.ps-cta-primary,
button.ps-sticky-cta {
  cursor: pointer;
}
```

JS: **evitable** si se mantienen anchors con clases legacy.

## 3.2 Restore banner (`/index.html`)

Archivo objetivo: `index.html`  
Fragmento mínimo:

```html
<section id="eval-restore-banner" class="ps-restore" hidden>
  <!-- contenido visual puede cambiar -->
</section>
```

Motivo: hay lectura directa por `getElementById("eval-restore-banner")`.

## 3.3 Diagnóstico: submit/change bridge (`/evaluador.html`)

Archivo objetivo: `evaluador.html`  
Fragmento mínimo:

```html
<form id="evaluador-form" onsubmit="event.preventDefault(); calcularRiesgo();" novalidate>
  <select id="tipo-inmueble" name="tipo_inmueble" onchange="cambiarFormulario(this.value)"></select>
  <div id="formulario-vivienda"></div>
  <div id="formulario-comercio"></div>
</form>
```

JS: solo último recurso (si retheme elimina inline handlers): añadir listener puente equivalente en script inline, sin tocar motor IEI.

## 3.4 Diagnóstico: preguntas IEI (`/js/iei-evaluador-user-v1.js` dependiente de DOM)

Archivo objetivo: `evaluador.html`  
Fragmento mínimo compatible:

```html
<div id="iei-vivienda-root">
  <select data-qid="..."></select>
</div>
<div id="iei-comercio-root">
  <select data-qid="..."></select>
</div>
```

Mitigación: si UI nueva usa cards/radios, mantener `select[data-qid]` oculto y sincronizado.

## 3.5 Resultado CTAs (`/resultado.html`, `/js/resultado.js`)

Archivo objetivo: `resultado.html`  
Fragmento mínimo:

```html
<div id="risk-score"></div>
<span id="risk-level-badge"></span>
<ul id="recommendations-list"></ul>
<ul id="top-factors-list"></ul>
<button id="cta-request" type="button"></button>
<button id="cta-keep" type="button"></button>
```

Motivo: render y eventos acoplados por ID en `js/resultado.js`.

## 3.6 Lead form payload (`/solicitar-propuesta.html`, `/js/lead-form.js`)

Archivo objetivo: `solicitar-propuesta.html`  
Fragmento mínimo:

```html
<form id="lead-form" novalidate>
  <input id="name" name="name" required>
  <input id="phone" name="phone" required>
  <input id="email" name="email" type="email" required>
  <input id="postal_code" name="postal_code" required>
  <input id="consent" name="consent" type="checkbox" required>
</form>
```

Regla: no cambiar `id/name` porque `lead-form.js` serializa por `getElementById` + validaciones.

## 3.7 OTP modal capas/focus (`/solicitar-propuesta.html`, `css/compat.css`)

Archivo objetivo: `css/compat.css`  
Parche recomendado:

```css
/* Evita que sticky/header tapen OTP */
#ps-otp-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
}
.ps-sticky-bar { z-index: 9000; }
.ps-header { z-index: 8000; }
```

Archivo objetivo: `solicitar-propuesta.html`  
Mantener `#ps-otp-overlay`, `.otp-digit`, `#ps-otp-confirm`, `#ps-otp-resend`, `#ps-otp-close`.

## 3.8 Tracking attrs y CTA anchors (`/index.html`, `/js/ps-cta.js`)

Archivo objetivo: `index.html` y páginas con CTA a `/diagnostico`  
Fragmento mínimo:

```html
<a class="ps-cta-primary ps-sticky-cta"
   href="/diagnostico"
   data-ps-placement="sticky"
   data-ps-segment="vivienda">
</a>
```

Motivo: analítica usa `placement/segment` y delegación sobre `a.ps-cta-primary, a.ps-sticky-cta`.

## 3.9 Orden de carga CSS/JS (P0)

Archivo objetivo: `index.html`, `evaluador.html`, `resultado.html`, `solicitar-propuesta.html`, `confirmacion.html`  
Regla de parche:

```html
<link rel="stylesheet" href="/css/ps-tokens.css">
<link rel="stylesheet" href="/css/ps-components.css">
<link rel="stylesheet" href="/css/ps-pages/<ruta>.css">
<link rel="stylesheet" href="/css/compat.css"> <!-- siempre al final -->
```

Mantener scripts en el orden congelado en `docs/NO_TOCAR.md`.

## 3.10 Aislamiento admin (`/admin/*.html`, `/styles/leads.css`)

Archivo objetivo: `admin/*.html`  
Mitigación 1 (preferida): no cargar `ps-ui.css`, `ps-tokens.css`, `ps-components.css` ni `compat.css` en admin.  
Mitigación 2 (si se comparte CSS global): scope estricto del retheme a body no-admin.

```css
/* ejemplo de aislamiento */
body:not(.admin-page) .ps-header { /* reglas retheme */ }
body:not(.admin-page) .ps-sticky-bar { /* reglas retheme */ }
```

Operativa recomendada: marcar admin con clase explícita en `<body class="admin-page">`.

## 4) Reglas de decisión para tocar JS (último recurso)

Tocar JS solo si se cumple al menos una:

1. El nuevo diseño exige cambiar `a` por `button` en CTA y no se pueden conservar clases/attrs en ancla.
2. La UI nueva elimina `select[data-qid]` y no puede mantenerse un campo espejo oculto.
3. El flujo OTP requiere nuevo estado UI imposible de resolver con CSS/HTML alias.

Si ocurre, parche mínimo recomendado:

- `js/ps-cta.js`: ampliar selector delegado a `button.ps-cta-primary` sin alterar payload/evento.
- `js/iei-evaluador-user-v1.js`: aceptar selector alternativo, manteniendo fallback legacy.
- `js/lead-form.js`: no alterar endpoints ni payload; solo adaptación de bindings DOM.

## 5) Checklist de salida (pre-merge retheme)

1. `bash scripts/audit_p0.sh` -> PASS.
2. `bash scripts/retheme_risk_scan.sh` -> contratos P0 presentes (DOM/storage/API/tracking).
3. `bash scripts/retheme_css_collision_scan.sh` -> sin nuevos globales peligrosos no justificados.
4. `docs/SMOKE_P0.md` completo en desktop + móvil (OTP y `/api/events` incluidos).
5. Sin cambios de contrato contra `docs/NO_TOCAR.md` o, si los hay, documentados y versionados.
