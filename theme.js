// Applies the saved light/dark choice before the page paints (no flash). Default: follow the device.
(function () {
  var t = null;
  try { t = localStorage.getItem('ibisr.theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') t = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();
