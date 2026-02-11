(function psCtaBootstrap() {
  const CTA_TEXT = "Hacer diagnóstico en 2 minutos";
  const TRUST_TEXT = "Sin llamadas. Solo compartimos datos si tú lo decides.";

  function normalizePath(pathname) {
    return pathname.replace(/\/+$/, "") || "/";
  }

  function currentPath() {
    return normalizePath(window.location.pathname || "/");
  }

  function isDiagnosticoPath(path) {
    return path === "/diagnostico" || path === "/evaluador.html";
  }

  function isSolicitarPath(path) {
    return path === "/solicitar-propuesta" || path === "/solicitar-propuesta.html";
  }

  function isResultadoPath(path) {
    return path === "/resultado" || path === "/resultado.html";
  }

  function isConfirmacionPath(path) {
    return path === "/confirmacion" || path === "/confirmacion.html";
  }

  function isBlogPath(path) {
    return path === "/blog" || path === "/blog.html" || path.startsWith("/blog/posts/");
  }

  function isAutorPath(path) {
    return path === "/autor" || path === "/autor.html";
  }

  function setAnchorLabel(anchor, text) {
    const span = anchor.querySelector("span");
    if (span) {
      span.textContent = text;
    } else {
      anchor.textContent = text;
    }
    anchor.setAttribute("aria-label", text);
  }

  function normalizeLegacyCtas() {
    document.querySelectorAll(".expert-invite-action img").forEach((img) => img.remove());

    document.querySelectorAll(".header-contact-group, .header-cta-group").forEach((group) => {
      group.classList.add("ps-header-cta");
    });

    document.querySelectorAll("a.header-contact, a.header-cta").forEach((anchor) => {
      anchor.classList.add("ps-cta-primary");
      anchor.setAttribute("href", "/diagnostico");
      anchor.removeAttribute("target");
      anchor.removeAttribute("rel");
      anchor.dataset.psPlacement = "header";
      setAnchorLabel(anchor, CTA_TEXT);
    });

    document.querySelectorAll(".header-contact-note, .header-cta-note").forEach((note) => {
      note.classList.add("ps-trustline");
      note.textContent = TRUST_TEXT;
    });

    document.querySelectorAll("a.hero-cta, a.expert-invite-action, a.mobile-flow-cta").forEach((anchor) => {
      if (anchor.getAttribute("href") !== "/diagnostico") return;
      anchor.classList.add("ps-cta-primary");
      anchor.dataset.psPlacement = anchor.classList.contains("mobile-flow-cta") ? "sticky" : "inline";
      setAnchorLabel(anchor, CTA_TEXT);
    });

    document.querySelectorAll("a[href='/diagnostico']").forEach((anchor) => {
      if (!anchor.closest("header") && anchor.classList.contains("btn-primary")) {
        anchor.classList.add("ps-cta-primary");
        anchor.dataset.psPlacement = anchor.dataset.psPlacement || "inline";
      }
    });
  }

  function createHeaderCtaGroup() {
    const headerInner =
      document.querySelector("header .header-inner") ||
      document.querySelector("header .container") ||
      document.querySelector("header");

    if (!headerInner) return;

    if (headerInner.querySelector(".ps-header-cta")) return;

    const group = document.createElement("div");
    group.className = "ps-header-cta";

    const anchor = document.createElement("a");
    anchor.className = "ps-cta-primary";
    anchor.href = "/diagnostico";
    anchor.dataset.psPlacement = "header";
    anchor.textContent = CTA_TEXT;
    anchor.setAttribute("aria-label", CTA_TEXT);

    const trust = document.createElement("div");
    trust.className = "ps-trustline";
    trust.textContent = TRUST_TEXT;

    group.appendChild(anchor);
    group.appendChild(trust);
    headerInner.appendChild(group);
  }

  function createInlineCta(placement) {
    const wrapper = document.createElement("div");
    wrapper.className = "ps-cta-stack";
    wrapper.dataset.psInlineCta = placement;

    const anchor = document.createElement("a");
    anchor.className = "ps-cta-primary";
    anchor.href = "/diagnostico";
    anchor.dataset.psPlacement = placement;
    anchor.textContent = CTA_TEXT;
    anchor.setAttribute("aria-label", CTA_TEXT);

    const trust = document.createElement("div");
    trust.className = "ps-trustline";
    trust.textContent = TRUST_TEXT;

    wrapper.appendChild(anchor);
    wrapper.appendChild(trust);
    return wrapper;
  }

  function injectInlineCtasForLongPages(path) {
    if (!(isBlogPath(path) || isAutorPath(path))) return;

    const main = document.querySelector("main");
    if (!main) return;

    if (!main.querySelector("[data-ps-inline-cta='after-first']")) {
      const firstParagraph = main.querySelector("p");
      if (firstParagraph && firstParagraph.parentNode) {
        const cta = createInlineCta("inline_after_first");
        cta.dataset.psInlineCta = "after-first";
        cta.style.marginTop = "1rem";
        cta.style.marginBottom = "1rem";
        firstParagraph.parentNode.insertBefore(cta, firstParagraph.nextSibling);
      }
    }

    if (!main.querySelector("[data-ps-inline-cta='before-footer']")) {
      const footer = document.querySelector("footer");
      if (footer && footer.parentNode) {
        const cta = createInlineCta("inline_before_footer");
        cta.dataset.psInlineCta = "before-footer";
        cta.style.display = "flex";
        cta.style.alignItems = "center";
        cta.style.margin = "2rem auto";
        cta.style.maxWidth = "980px";
        cta.style.padding = "0 1.5rem";
        footer.parentNode.insertBefore(cta, footer);
      }
    }
  }

  function ensureFunnelMap(path) {
    const main = document.querySelector("main");
    if (!main || main.querySelector(".ps-funnel-map")) return;

    let label = "";
    if (path === "/" || path === "/index.html") {
      label = "Flujo: Diagnóstico -> Resultado -> Propuesta";
    } else if (isDiagnosticoPath(path)) {
      label = "Paso 1 de 4 - Diagnóstico";
    } else if (isResultadoPath(path)) {
      label = "Paso 2 de 4 - Resultado";
    } else if (isSolicitarPath(path)) {
      label = "Paso 3 de 4 - Solicitud";
    } else if (isConfirmacionPath(path)) {
      label = "Paso 4 de 4 - Confirmación";
    }

    if (!label) return;

    const map = document.createElement("div");
    map.className = "ps-funnel-map";
    map.textContent = label;

    const target = main.querySelector(".container") || main.firstElementChild || main;
    if (target.firstChild) {
      target.insertBefore(map, target.firstChild);
    } else {
      target.appendChild(map);
    }
  }

  function ensureStickyCta(path) {
    if (isSolicitarPath(path)) {
      document.body.setAttribute("data-ps-sticky", "off");
      document.querySelectorAll(".ps-sticky-cta, .mobile-flow-cta").forEach((node) => node.remove());
      return;
    }

    if (isDiagnosticoPath(path)) {
      document.querySelectorAll(".mobile-flow-cta").forEach((node) => node.remove());
      let sticky = document.querySelector(".ps-sticky-cta[data-ps-diagnostico='1']");
      if (!sticky) {
        sticky = document.createElement("a");
        sticky.className = "ps-sticky-cta ps-sticky-cta--hidden";
        sticky.href = "#evaluador-form";
        sticky.dataset.psPlacement = "sticky";
        sticky.dataset.psDiagnostico = "1";
        sticky.textContent = "Seguir diagnóstico";
        document.body.appendChild(sticky);
      }

      const form = document.getElementById("evaluador-form");
      const tipoInmueble = document.getElementById("tipo-inmueble");
      const hasProgress = () => {
        if (window.sessionStorage.getItem("puntoSeguro.quizStarted") === "1") return true;
        if (tipoInmueble && tipoInmueble.value) return true;
        return false;
      };

      const refresh = () => {
        if (hasProgress()) {
          sticky.classList.remove("ps-sticky-cta--hidden");
        } else {
          sticky.classList.add("ps-sticky-cta--hidden");
        }
      };

      const markStarted = () => {
        window.sessionStorage.setItem("puntoSeguro.quizStarted", "1");
        refresh();
      };

      refresh();
      if (tipoInmueble) {
        tipoInmueble.addEventListener("change", markStarted);
      }
      if (form) {
        form.addEventListener("change", markStarted);
      }
      return;
    }

    let sticky = document.querySelector(".ps-sticky-cta");
    if (!sticky) {
      sticky = document.createElement("a");
      sticky.className = "ps-sticky-cta";
      sticky.href = "/diagnostico";
      sticky.dataset.psPlacement = "sticky";
      sticky.textContent = CTA_TEXT;
      document.body.appendChild(sticky);
    } else {
      sticky.classList.add("ps-sticky-cta");
      sticky.href = "/diagnostico";
      sticky.dataset.psPlacement = "sticky";
      sticky.textContent = CTA_TEXT;
    }
  }

  function inferPlacement(anchor) {
    if (anchor.dataset.psPlacement) return anchor.dataset.psPlacement;
    if (anchor.classList.contains("ps-sticky-cta") || anchor.classList.contains("mobile-flow-cta")) return "sticky";
    if (anchor.closest("header")) return "header";
    if (anchor.closest("footer")) return "footer";
    return "inline";
  }

  function track(eventName, payload) {
    if (window.analytics && typeof window.analytics.track === "function") {
      window.analytics.track(eventName, payload);
      return;
    }
    if (window.PuntoSeguroAnalytics && typeof window.PuntoSeguroAnalytics.trackEvent === "function") {
      window.PuntoSeguroAnalytics.trackEvent(eventName, payload);
      return;
    }
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, payload || {});
    }
  }

  function bindTracking(path) {
    document.addEventListener("click", (event) => {
      const anchor = event.target.closest("a");
      if (!anchor) return;

      const rawHref = anchor.getAttribute("href") || "";
      const isProgressCta = isDiagnosticoPath(path) && rawHref === "#evaluador-form";

      let isDiagnosticoCta = false;
      try {
        if (rawHref) {
          const resolved = new URL(rawHref, window.location.origin);
          isDiagnosticoCta = normalizePath(resolved.pathname) === "/diagnostico";
        }
      } catch (_error) {
        isDiagnosticoCta = false;
      }

      if (!isProgressCta && !isDiagnosticoCta) return;

      if (anchor.closest("nav") && !anchor.classList.contains("ps-cta-primary")) {
        return;
      }

      track("cta_diagnostico_clicked", {
        page: window.location.pathname,
        placement: inferPlacement(anchor),
      });
    });
  }

  function run() {
    const path = currentPath();
    normalizeLegacyCtas();
    createHeaderCtaGroup();
    injectInlineCtasForLongPages(path);
    ensureFunnelMap(path);
    ensureStickyCta(path);
    bindTracking(path);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
