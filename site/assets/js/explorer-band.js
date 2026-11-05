// The home page's Explorer band: one control over figures scripts/build_explorer.py poured from the model. Without scripts, and in print, every stop shows.
(function () {
  const band = document.querySelector('.explorer-band');
  if (!band) return;
  const stops = [...band.querySelectorAll('[data-stop]')];
  const show = (value) => stops.forEach((stop) => { stop.hidden = stop.dataset.stop !== value; });
  band.addEventListener('change', (e) => {
    show(e.target.value);
    band.querySelector('[data-band-status]').textContent = stops.find((stop) => !stop.hidden).querySelector('.explorer-band-reading').textContent;
  });
  band.querySelector('fieldset').hidden = false;
  show(band.querySelector('input:checked').value); // a reload may restore another stop
}());
