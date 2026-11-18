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

// The address, #anchor&name=value, as theme.js reads and writes it for every script (window.siteAddress): one grammar, one place. A filter or a tick replaces
// the history entry; only a change of place (a tab) pushes one. A link within the page keeps the filters (theme.js), and an old link's ?query moves into the fragment.
export const address = () => window.siteAddress.read();
export const writeAddress = (anchor, params, push = false) => window.siteAddress.write(anchor, params, push);

// Reads the named form fields from the address, and returns a function that writes them back, so a filtered view can be linked. Other settings and the anchor are kept.
// Back, Forward, or an address typed in puts the fields where the address says and runs the page's filter, as an input would (CW 4); a link the reader
// followed keeps them (theme.js tells the two apart, before this hears the change).
export function linkFilters(form, names) {
  const { anchor, params } = address();
  for (const name of names) {
    const field = form.elements.namedItem(name);
    if (field && params.has(name)) field.value = params.get(name);
  }
  writeAddress(anchor, params);
  window.addEventListener('hashchange', () => {
    if (window.siteAddress.followed) return;
    const now = address().params;
    const field = (name) => form.elements.namedItem(name);
    const moved = names.filter((name) => field(name) && field(name).value !== (now.get(name) ?? ''));
    for (const name of moved) field(name).value = now.get(name) ?? ''; // every field first, so the filter runs once on the whole address
    for (const name of moved) for (const type of ['input', 'change']) field(name).dispatchEvent(new Event(type, { bubbles: true })); // as a reader's change: a form's input, a picker's change
  });
  return () => {
    const { anchor: at, params: next } = address();
    for (const name of names) {
      const value = form.elements.namedItem(name)?.value.trim();
      if (value) next.set(name, value);
      else next.delete(name);
    }
    writeAddress(at, next);
  };
}

// Fills every [data-figure="name"] element with its value.
export function setFigure(name, value) {
  for (const el of document.querySelectorAll(`[data-figure="${name}"]`)) el.textContent = value;
}
