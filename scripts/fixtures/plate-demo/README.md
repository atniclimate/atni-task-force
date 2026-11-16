# Plate demo fixture

A frozen fixture for the plate kit's jsdom check (`node scripts/page_check.js --page plate`, from `scripts/page_checks/plate.js`).
Its base page (`index.html`, `demo.js`) was hand-built. `scripts/fixtures/kit_make_demo.py` re-pours its plates and refreshes its copies of the shipped claims and the comparison model.
`sources/index.html` is its Sources page (owner ruling 39): only the markers that `python scripts/build_plates.py --site scripts/fixtures/plate-demo` fills, where the plate check reads a receipt's limit.
Its sentences and figures are test data, not site copy, and nothing here is published.
