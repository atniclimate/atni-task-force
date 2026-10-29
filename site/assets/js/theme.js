// Applies a saved light or dark choice before the page paints, then wires the theme button.
// Dark is the default. The choice stays in this browser on this device only.
(function () {
  var KEY = 'atni-energy-theme';
  var root = document.documentElement;

  function read() {
    try { return window.localStorage.getItem(KEY); } catch (error) { return null; }
  }
  function save(value) {
    try { window.localStorage.setItem(KEY, value); } catch (error) { /* storage blocked: the choice lasts for this page only */ }
  }

  var saved = read();
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    function label() {
      button.textContent = root.getAttribute('data-theme') === 'light' ? 'Use dark theme' : 'Use light theme';
    }
    label();
    button.hidden = false;
    button.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      save(next);
      label();
    });
  });
})();
