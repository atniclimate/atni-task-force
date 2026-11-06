// Shared helpers for the pages that read the site's data files.
// Every value from a data file is escaped before it reaches the page, and only https
// addresses or paths inside this site become links.

export const ROOT = new URL('../../', import.meta.url);

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function href(url) {
  const text = String(url ?? '').trim();
  if (/^https:\/\//i.test(text)) return esc(text);
  if (!text || /^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith('//')) return '#';
  return esc(new URL(text, ROOT).href);
}

// House style shows dates as MM/DD/YYYY; the data files keep ISO dates.
export const day = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso ?? '');
};
export const usDates = (text) => String(text ?? '').replace(/(?<![\w/.-])(\d{4})-(\d{2})-(\d{2})(?![\w/-])/g, '$2/$3/$1');

export const fold = (text) => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const STATES = {
  AK: 'Alaska', CA: 'California', ID: 'Idaho', MT: 'Montana', NV: 'Nevada', OR: 'Oregon', UT: 'Utah', WA: 'Washington',
};

export async function getJSON(path) {
  const response = await fetch(new URL(path, ROOT));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

// Reads the named form fields from the address bar, and returns a function that writes them
// back, so a filtered view can be linked. Other parameters and the fragment are kept.
export function linkFilters(form, names) {
  const params = new URLSearchParams(window.location.search);
  for (const name of names) {
    const field = form.elements.namedItem(name);
    if (field && params.has(name)) field.value = params.get(name);
  }
  return () => {
    const next = new URLSearchParams(window.location.search);
    for (const name of names) {
      const value = form.elements.namedItem(name)?.value.trim();
      if (value) next.set(name, value);
      else next.delete(name);
    }
    const query = next.toString();
    try { window.history.replaceState(null, '', `${query ? `?${query}` : window.location.pathname}${window.location.hash}`); } catch { /* throttled: the next change writes it */ }
  };
}

// The element the address's fragment names, or null: a pasted link with a broken escape, such as #%E0, names nothing and stops nothing.
export function hashTarget() {
  try {
    return document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
  } catch {
    return null;
  }
}

// Fills every [data-figure="name"] element with its value.
export function setFigure(name, value) {
  for (const el of document.querySelectorAll(`[data-figure="${name}"]`)) el.textContent = value;
}

// Adds <option>s to a <select>, each with a count, leaving out options with no entries.
export function addOptions(select, options) {
  select.insertAdjacentHTML(
    'beforeend',
    options.filter(([, , n]) => n).map(([value, label, n]) => `<option value="${esc(value)}">${esc(label)} (${n})</option>`).join(''),
  );
}

// A plate's detail panel as a <details> (the Energy pages): closed until a reader selects a row or follows a link into it, its summary the Reading up to a second colon or a first
// period. Without scripts, and in print, the panel shows as the build wrote it. The live region stays outside, so a selection is still spoken.
export function closedDetail(figure) {
  const id = figure.dataset.plate;
  const panel = figure.querySelector('.plate-detail');
  const reading = panel.querySelector('.reading');
  const more = Object.assign(document.createElement('details'), { className: 'plate-more energy-detail' });
  const line = document.createElement('summary');
  const sync = () => { line.textContent = /^[^:.]*(?::[^:.]*)?/.exec(reading.textContent)[0]; };
  sync();
  new MutationObserver(sync).observe(reading, { childList: true, characterData: true, subtree: true });
  more.append(line, ...[...panel.children].filter((node) => node.tagName !== 'OUTPUT'));
  panel.prepend(more);
  const query = new URLSearchParams(window.location.search);
  const target = document.getElementById(window.location.hash.slice(1));
  more.open = query.has(id) || query.has(`${id}-view`) || more.contains(target);
  if (more.contains(target)) {
    panel.querySelector(`.plate-views input[value="${target.closest('.plate-view').dataset.view}"]`).click();
    target.scrollIntoView();
  }
  figure.addEventListener('click', (event) => { if (event.target.closest('.plate-plot [data-row]')) more.open = true; });
  figure.querySelector('.plate-plot').addEventListener('keydown', (event) => { if (/^(Arrow|Home$|End$|Enter$| $)/.test(event.key)) more.open = true; });
}
