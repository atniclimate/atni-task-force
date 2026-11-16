# Plate demo fixture

A frozen fixture for the plate kit's jsdom check (`node scripts/page_check.js --page plate`, from `scripts/page_checks/plate.js`).
Its base page (`index.html`, `demo.js`) was hand-built. `scripts/fixtures/kit_make_demo.py` re-pours its plates and refreshes its copies of the shipped claims and the comparison model.
`python scripts/build_plates.py --site scripts/fixtures/plate-demo` pours every plate, answer, and figure in it.
`sources/index.html` is its Sources page (owner ruling 39): only the markers that `python scripts/build_plates.py --site scripts/fixtures/plate-demo` fills, where the plate check reads a receipt's limit.
Its sentences and figures are test data, not site copy, and nothing here is published.

It holds every contract a page builds against (DIRECTION-R2 sections 3.1 to 3.12), so a change to the kit that breaks one fails here first:
the brief with its Sources link; the agenda (the meter as a face, a list face with each set's Add, a face of words), above the tab strip;
tabs as a name and a question, group labels, and the strip's Sources link and Meeting sheet button; each variant (face, lead, `repeat-demo` as a
repeater, `shift-demo` in a `.plate-strip`, `capital-history` named `atlas`); the page's one `form.asks` in its Questions panel, with `sheet.js`;
and a claim mark and a term with the prose tip's `#cr-data` and `cite.js`. That block is `pour_claim_refs.tip_data()`'s output for the brief's and the
form's marks, written once by hand, since `pour_claim_refs.py` runs only on `site/`: write it again with that function if the marks change.
