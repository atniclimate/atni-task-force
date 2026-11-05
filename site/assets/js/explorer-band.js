// The home page's instrument: the Explorer's model at its defaults, poured by scripts/build_explorer.py, so the home page loads none of it. A row and a boundary are native radios,
// so Tab, arrows, and screen readers work as they do anywhere. Without scripts, and in print, the whole hour shows and the table under it holds every boundary. Text by textContent only.
(function () {
  const band = document.querySelector('.home-instrument');
  if (!band) return;
  const { stops } = JSON.parse(band.querySelector('#home-ladder').textContent);
  const foot = document.querySelector('.home-foot');
  const ladder = band.querySelector('.ladder');
  const grid = ladder.querySelector('.ladder-grid');
  const needle = grid.querySelector('.ladder-needle');
  const shared = grid.querySelector('.ladder-shared');
  const rows = [...ladder.querySelectorAll('.ladder-row')];
  const place = (node, values) => Object.entries(values).forEach(([name, v]) => node.style.setProperty(name, v));
  const boundary = () => foot.querySelector('input:checked').value;
  const tick = (tag, x, words) => {
    const node = document.createElement(tag);
    place(node, { '--x': x });
    node.textContent = words;
    return node;
  };

  function ruler() {
    const { ticks, fixed } = stops[boundary()];
    grid.querySelectorAll('i:not(.ladder-needle):not(.ladder-tick)').forEach((node) => node.remove());
    grid.prepend(...ticks.map(([x]) => tick('i', x, '')));
    ladder.querySelector('.ladder-axis').replaceChildren(...ticks.map(([x, words]) => tick('span', x, words)));
    grid.querySelector('.ladder-tick').hidden = fixed === null; // the screen and router are counted only at the whole hour
  }
  function paint(key = ladder.querySelector('input:checked').value) {
    const at = stops[boundary()].rows;
    const r = at[key];
    for (const row of rows) {
      const f = at[row.dataset.row];
      place(row, { '--x': f.x, '--lo': f.lo, '--hi': f.hi });
      row.classList.toggle('is-on', row.dataset.row === key);
      row.querySelector('.ladder-num').textContent = f.num;
      row.querySelector('.ladder-tag').textContent = f.tag;
    }
    place(ladder, { '--at': r.x });
    needle.classList.toggle('is-flip', r.x > 0.6);
    const name = rows.find((row) => row.dataset.row === key).querySelector('.ladder-label').textContent;
    needle.firstElementChild.textContent = boundary() === 'whole' ? name : `${name}, your setting`;
    shared.hidden = !r.shared;
    if (r.shared) { // one band across the rows that share ground, with what it spans; home.css places it from the row numbers, so it holds through a font's arrival, the receipts opening, and print
      place(shared, { '--lo': r.shared.lo, '--hi': r.shared.hi, '--from': r.shared.from, '--to': r.shared.to, '--rows': rows.length });
      shared.classList.toggle('is-flip', r.shared.flip);
      shared.firstElementChild.textContent = r.shared.say;
    }
    band.querySelector('.readout-value').textContent = r.num;
    band.querySelector('.reading').textContent = r.reading;
  }
  const say = () => { band.querySelector('[data-band-status]').textContent = band.querySelector('.reading').textContent; };
  ladder.addEventListener('change', () => { paint(); say(); });
  foot.addEventListener('change', () => { ruler(); paint(); say(); });
  // A row under the pointer shows in the readout, as on any plate; the checked row comes back when the pointer leaves.
  ladder.addEventListener('pointerover', (e) => { const row = e.target.closest('.ladder-row'); if (row) paint(row.dataset.row); });
  ladder.addEventListener('pointerleave', () => paint());

  // Receipts open in place, on the button or on a chip, which sends focus to them. Escape comes back to the button.
  const panel = document.getElementById('home-receipts');
  const toggle = foot.querySelector('[data-receipts]');
  const open = (on) => {
    panel.hidden = !on;
    toggle.setAttribute('aria-expanded', on);
    toggle.textContent = on ? 'Hide receipts' : 'Receipts';
  };
  toggle.addEventListener('click', () => open(panel.hidden));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('a[href="#home-receipts"]')) return;
    e.preventDefault();
    open(true);
    panel.focus();
    panel.scrollIntoView?.({ block: 'nearest' });
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    open(false);
    toggle.focus();
  });

  foot.querySelector('fieldset').hidden = false;
  toggle.hidden = false;
  ladder.querySelectorAll('input').forEach((input) => { input.hidden = false; });
  open(location.hash === '#home-receipts');
  ruler(); // a reload may restore another stop
  paint();
}());
