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
    window.history.replaceState(null, '', `${query ? `?${query}` : window.location.pathname}${window.location.hash}`);
  };
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
