(function ieiUi() {
  const meta = window.PS_IEI;
  if (!meta) return;

  function fillAll(selector, text) {
    if (!text) return;
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = text;
    });
  }

  // Title: link only the "IEI™" label to /iei, keep rest as plain text.
  document.querySelectorAll("#ps-iei-title, .ps-iei-title").forEach((node) => {
    // Clear any previous content to avoid duplicating on SPA-like navigations.
    node.textContent = "";

    const label = meta.label || "IEI™";
    const full = meta.full_name || label;
    const rest = full.startsWith(label) ? full.slice(label.length) : ` — ${full}`;

    const link = document.createElement("a");
    link.href = "/iei";
    link.className = "ps-iei-link";
    link.textContent = label;
    link.setAttribute("aria-label", "Qué es IEI™");

    node.appendChild(link);
    node.appendChild(document.createTextNode(rest));
  });

  fillAll("#ps-iei-desc, .ps-iei-desc", meta.desc);
  fillAll("#ps-iei-legal, .ps-iei-legal", meta.legal);
})();
