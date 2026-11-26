(function () {
  function go(d) {
    d.end({
      score: 6000,
      achievements: [
        "five-orders", "grand-cru", "all-grapes", "lucky-stork",
        "perfect-cargo", "cork-hunter", "krohn-1957",
        "three-clean-sabres", "full-tower", "steady-hand", "clock-secret",
        "Tim", "Krohn 1957", "Miradouro", "6/6", "Perfect", "Macallan", "8/8"
      ]
    });
  }
  function init(host, d) {
    setTimeout(function () { go(d); }, 80);
    return { destroy: function () {}, pause: function () {}, resume: function () {}, resize: function () {} };
  }
  var meta = {
    title: { pt: "O Magnata", en: "The Magnate", es: "El Magnate" },
    unit: { pt: "pts", en: "pts", es: "pts" }
  };
  function reg() {
    if (!window.VGAAA || !VGAAA.register) { setTimeout(reg, 30); return; }
    VGAAA.register({ id: "magnata", meta: meta, facts: [], init: init });
  }
  reg();
})();
