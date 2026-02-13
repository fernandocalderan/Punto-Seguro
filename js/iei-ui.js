(function ieiUi() {
  const meta = window.PS_IEI;
  if (!meta) return;

  function fillAll(selector, text) {
    if (!text) return;
    document.querySelectorAll(selector).forEach((node) => {
      node.textContent = text;
    });
  }

  fillAll("#ps-iei-title, .ps-iei-title", meta.full_name);
  fillAll("#ps-iei-desc, .ps-iei-desc", meta.desc);
  fillAll("#ps-iei-legal, .ps-iei-legal", meta.legal);
})();

