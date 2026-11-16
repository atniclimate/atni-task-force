// Runs first, blocking, on every page. It marks the page as scripted before it paints (site.css hides [data-js] parts without scripts, so nothing jumps when
// they appear), applies a saved light or dark choice, holds the one reading of the address every other script uses, and wires the theme button.
// Dark is the default. The choice stays in this browser on this device only.
(function () {
  var KEY = 'atni-energy-theme';
  var root = document.documentElement;
  root.classList.add('js');

  function read() {
    try { return window.localStorage.getItem(KEY); } catch (error) { return null; }
  }
  function save(value) {
    try { window.localStorage.setItem(KEY, value); } catch (error) { /* storage blocked: the choice lasts for this page only */ }
  }

  var saved = read();
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);

  // The address: #anchor&name=value. The anchor, when there is one, comes first and names an element; settings follow it. A fragment never reaches a server
  // (owner ruling 29); an old link's ?query is read as part of the address, and the next write moves it into the fragment. plate.js and util.js read and write
  // only through these. keep(name): whether a link within the page keeps that name (plate.js narrows it to the plate the reader last touched).
  function parse(raw) {
    var first = raw.split('&')[0];
    var anchor = first.indexOf('=') < 0 ? first : '';
    return { anchor: anchor, params: new URLSearchParams(anchor ? raw.slice(first.length + 1) : raw) };
  }
  function address() {
    var at = parse(location.hash.slice(1));
    new URLSearchParams(location.search).forEach(function (value, name) { if (!at.params.has(name)) at.params.append(name, value); });
    return at;
  }
  // push: a new history entry, for a change of place (a tab); everything else replaces the entry, so Back leaves a page's settings, not a trail of clicks.
  function write(anchor, params, push) {
    var text = params.toString();
    var hash = [anchor, text].filter(Boolean).join('&');
    var url = location.pathname + (hash ? '#' + hash : '');
    try {
      if (push && url !== location.pathname + location.hash) history.pushState(null, '', url);
      else history.replaceState(null, '', url);
    } catch (error) { /* throttled: the next change writes it */ }
  }
  var site = window.siteAddress = { parse: parse, read: address, write: write, keep: function () { return true; }, followed: true };

  // A link within the page (#id) takes the whole fragment, so the settings the reader may keep come back after it: a reload or a copied link keeps them.
  // Back, Forward, or a typed address is not a link: the scripts then put the page where the address says (site.followed is false for that event).
  var link = '';
  var kind = '';
  document.addEventListener('click', function (event) {
    var a = event.target.closest && event.target.closest('a[href*="#"]');
    link = a && a.origin === location.origin && a.pathname === location.pathname ? a.hash : '';
  }, true);
  // Back and Forward traverse; where the Navigation API says so, the scripts then restore without moving focus or the scroll the browser restores.
  if (window.navigation) window.navigation.addEventListener('navigate', function (event) { kind = event.navigationType; });
  window.addEventListener('hashchange', function (event) {
    var now = address();
    site.followed = !!link && location.hash.split('&')[0] === link.split('&')[0];
    site.traversed = kind === 'traverse';
    link = '';
    kind = '';
    if (!site.followed || now.params.toString() || !event.oldURL) return;
    var kept = new URLSearchParams();
    parse(new URL(event.oldURL).hash.slice(1)).params.forEach(function (value, name) { if (site.keep(name)) kept.append(name, value); });
    if (kept.toString()) write(now.anchor, kept);
  });

  // A deep link into a closed disclosure opens it, and every disclosure around it. A broken escape names nothing.
  function reveal() {
    var id = '';
    try { id = decodeURIComponent(address().anchor); } catch (error) { /* names nothing */ }
    var target = id && document.getElementById(id);
    var opened = false;
    for (var box = target && target.closest('details'); box; box = box.parentElement.closest('details')) {
      if (!box.open) { box.open = true; opened = true; }
    }
    if (opened) target.scrollIntoView();
  }
  window.addEventListener('hashchange', reveal);
  document.addEventListener('DOMContentLoaded', reveal);

  // One label, "Use light theme", and its state in aria-pressed (home-shell-11). The button is a data-js part, so it is laid out from the first paint.
  document.addEventListener('DOMContentLoaded', function () {
    var button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    function mark() { button.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'light')); }
    mark();
    button.hidden = false;
    button.addEventListener('click', function () {
      root.setAttribute('data-theme', root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
      save(root.getAttribute('data-theme'));
      mark();
    });
  });
})();
