(function analyticsBootstrap() {
  async function trackEvent(eventName, payload) {
    const safePayload = payload || {};

    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, safePayload);
    }

    try {
      await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_name: eventName,
          payload: safePayload,
          path: window.location.pathname,
        }),
      });
    } catch (_error) {
      // Ignore client-side analytics errors to avoid blocking UX.
    }
  }

  window.PuntoSeguroAnalytics = {
    trackEvent,
  };
})();
