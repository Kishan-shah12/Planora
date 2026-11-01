/* Theme initialization script to prevent flash of unstyled theme */
(function() {
  try {
    var stored = localStorage.getItem("planora_theme");
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = stored || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
