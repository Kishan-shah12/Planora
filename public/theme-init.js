/* Sets the theme before first paint so there is no light flash for dark-mode users. */
try {
  var saved = localStorage.getItem('aayojan.theme');
  var theme =
    saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.setAttribute('data-theme', theme);
} catch (e) {
  /* storage or matchMedia unavailable: stay on the light default */
}
