(function psCtaTracking() {
  function normalize(pathname) {
    return (pathname || "/").replace(/\/+$/, "") || "/";
  }

  function isDiagnosticoCta(anchor) {
    const href = anchor.getAttribute("href") || "";
    if (!href) return false;

    try {
      const url = new URL(href, window.location.origin);
      return normalize(url.pathname) === "/diagnostico";
    } catch (_error) {
      return false;
    }
  }

  function inferPlacement(anchor) {
    if (anchor.dataset.psPlacement) return anchor.dataset.psPlacement;
    if (anchor.closest(".ps-sticky-bar") || anchor.classList.contains("ps-sticky-cta")) return "sticky";
    if (anchor.closest("header")) return "header";
    return "inline";
  }

  function track(payload) {
    if (window.analytics && typeof window.analytics.track === "function") {
      window.analytics.track("cta_diagnostico_clicked", payload);
      return;
    }

    if (window.PuntoSeguroAnalytics && typeof window.PuntoSeguroAnalytics.trackEvent === "function") {
      window.PuntoSeguroAnalytics.trackEvent("cta_diagnostico_clicked", payload);
      return;
    }

    if (typeof window.gtag === "function") {
      window.gtag("event", "cta_diagnostico_clicked", payload);
    }
  }

  document.addEventListener("click", (event) => {
    const anchor = event.target.closest("a.ps-cta-primary, a.ps-sticky-cta");
    if (!anchor) return;
    if (!isDiagnosticoCta(anchor)) return;

    track({
      page: window.location.pathname,
      placement: inferPlacement(anchor),
    });
  });
})();

/* ===== Punto Seguro: política profesional de enlaces ===== */
(function () {
  function isExternalUrl(url) {
    try {
      const u = new URL(url, window.location.href);
      return u.origin !== window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function isPdf(url) {
    try {
      const u = new URL(url, window.location.href);
      return (u.pathname || "").toLowerCase().endsWith(".pdf");
    } catch (_) {
      return false;
    }
  }

  function shouldOpenNewTab(a) {
    const href = a.getAttribute("href") || "";
    if (!href) return false;

    // Ignorar anclas y pseudo-links
    if (href.startsWith("#")) return false;
    if (href.startsWith("javascript:")) return false;
    if (href.startsWith("mailto:")) return false;
    if (href.startsWith("tel:")) return false;

    // Forzado manual
    if (a.dataset && a.dataset.newtab === "1") return true;

    // Externo o PDF
    if (isExternalUrl(href)) return true;
    if (isPdf(href)) return true;

    return false;
  }

  function enhanceLink(a) {
    if (!shouldOpenNewTab(a)) return;

    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");

    // Marcar para estilo (icono ↗)
    a.dataset.external = "1";

    // Accesibilidad: aviso de nueva pestaña
    const label = a.getAttribute("aria-label") || a.textContent.trim();
    if (label && !label.toLowerCase().includes("nueva pestaña")) {
      a.setAttribute("aria-label", label + " (se abre en una nueva pestaña)");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("a[href]").forEach(enhanceLink);
  });
})();
