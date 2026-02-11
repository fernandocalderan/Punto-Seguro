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
