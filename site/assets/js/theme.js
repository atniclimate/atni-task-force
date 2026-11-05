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

  // A deep link into a closed disclosure opens it, and every disclosure around it.
  function reveal() {
    var target = document.getElementById(location.hash.slice(1));
    var opened = false;
    for (var box = target && target.closest('details'); box; box = box.parentElement.closest('details')) {
      if (!box.open) { box.open = true; opened = true; }
    }
    if (opened) target.scrollIntoView();
  }
  window.addEventListener('hashchange', reveal);
  document.addEventListener('DOMContentLoaded', reveal);

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
