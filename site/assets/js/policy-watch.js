// Policy Watch's saved searches and follow lists are written into each page by scripts/build_energy_pages.py, so this script fetches nothing. It only hides
// a page's development note about Policy Sentinel's prefill, which a reader cannot act on (data-centers-18); without scripts the note stays, as the page wrote it.
for (const note of document.querySelectorAll('[data-prefill-note]')) note.hidden = true;
