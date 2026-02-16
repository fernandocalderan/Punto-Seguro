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

(function ieiPreviewModal() {
  const modal = document.getElementById("psPreviewModal");
  if (!modal) return;

  const openers = document.querySelectorAll('[data-preview-open="1"]');
  const closers = modal.querySelectorAll('[data-preview-close="1"]');
  let lastFocus = null;

  function openModal() {
    lastFocus = document.activeElement;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("ps-modal-open");
    const closeBtn = modal.querySelector(".ps-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ps-modal-open");
    if (lastFocus && typeof lastFocus.focus === "function") {
      lastFocus.focus();
    }
  }

  openers.forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      openModal();
    });
  });

  closers.forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      closeModal();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (modal.getAttribute("aria-hidden") === "false" && e.key === "Escape") {
      closeModal();
    }
  });
})();
