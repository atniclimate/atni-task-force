// The prose tip (DIRECTION-R2 3.9): a plain click on a claim mark (a.cr) or a term (a.term) opens one popover in place, with the claim's source, publisher,
// date, status, and limit, or the term's definition, from the page's #cr-data (scripts/pour_claim_refs.py). Focus moves in; Escape, a click outside, or focus
// leaving closes it and gives focus back to the mark. Without scripts, without popover, or with a modifier key, the link goes to the Sources page or the
// glossary. Text by textContent only.
(function () {
  const block = document.getElementById('cr-data');
  if (!block || !Object.hasOwn(HTMLElement.prototype, 'popover')) return;
  const data = JSON.parse(block.textContent);
  const el = (tag, cls, ...kids) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    node.append(...kids);
    return node;
  };
  const link = (href, text) => Object.assign(el('a'), { href, textContent: text });
  const tip = Object.assign(el('dialog'), { id: 'cr-tip', tabIndex: -1 });
  tip.setAttribute('popover', 'auto');
  document.body.append(tip);
  let from = null;

  function fill(mark) {
    if (mark.classList.contains('term')) {
      const term = data.terms[mark.dataset.term];
      tip.setAttribute('aria-label', `Definition: ${term.name}`);
      tip.replaceChildren(el('p', 'cr-tip-title', term.name), el('p', '', term.words), el('p', '', link(mark.href, 'All terms in the glossary')));
      return;
    }
    const claim = data.claims[mark.dataset.claim];
    const title = /^https:\/\//.test(claim.url || '') ? link(claim.url, claim.title) : claim.title;
    tip.setAttribute('aria-label', `Source: ${claim.title}`);
    tip.replaceChildren(
      el('p', 'cr-tip-title', title),
      el('p', 'caption', [claim.publisher, claim.date && `published ${claim.date}`].filter(Boolean).join(', ')),
      el('p', 'caption', `${claim.status === 'partly verified' ? 'Partly verified.' : 'Verified against the source.'}${claim.limit ? ` Limit: ${claim.limit}` : ''} Claim ${mark.dataset.claim}.`),
      el('p', 'caption', link(mark.href, 'Full record on the Sources page')),
    );
  }
  // Under the mark, turned above it where the window ends, and held inside the window's sides (viewport-aware: no anchor positioning or its polyfill).
  function place() {
    if (!from || !tip.matches(':popover-open')) return; // a closed tip has nothing to place, so a scroll reads no layout
    const r = from.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const below = r.bottom + 8;
    tip.style.top = `${below + h > innerHeight - 8 && r.top - h - 8 > 8 ? r.top - h - 8 : Math.max(8, Math.min(below, innerHeight - h - 8))}px`;
    tip.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  }
  let shut = { mark: null, at: 0 }; // a press on the open tip's own mark light-dismisses it first; that press then closes, and does not reopen
  document.addEventListener('click', (e) => {
    const mark = e.target.closest?.('a.cr[data-claim], a.term[data-term]');
    if (!mark || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!(mark.classList.contains('term') ? data.terms[mark.dataset.term] : data.claims[mark.dataset.claim])) return; // the link goes on
    e.preventDefault();
    const again = (from === mark && tip.matches(':popover-open')) || (shut.mark === mark && performance.now() - shut.at < 500);
    if (tip.matches(':popover-open')) tip.hidePopover();
    shut = { mark: null, at: 0 };
    if (again) return;
    from = mark;
    fill(mark);
    tip.showPopover();
    place();
    mark.setAttribute('aria-expanded', 'true');
    tip.focus({ preventScroll: true });
  });
  // Closing, by Escape, a click outside, or focus leaving: the mark says so, and focus that was in the tip goes back to it.
  tip.addEventListener('beforetoggle', (e) => {
    if (e.newState !== 'closed' || !from) return;
    from.setAttribute('aria-expanded', 'false');
    shut = { mark: from, at: performance.now() };
    if (tip.contains(document.activeElement)) from.focus({ preventScroll: true });
  });
  tip.addEventListener('focusout', (e) => { if (e.relatedTarget && !tip.contains(e.relatedTarget) && e.relatedTarget !== from) tip.hidePopover(); });
  addEventListener('scroll', place, { passive: true, capture: true }); // capture: an inner scroller's scroll does not bubble, and its mark moves too
  addEventListener('resize', place);
})();
