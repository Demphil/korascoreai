(() => {
  function initializeArchiveFilters() {
    const form = document.querySelector('[data-archive-filters]');
    if (!form || form.dataset.archiveReady === 'true') return;

    const search = form.querySelector('[name="search"]');
    const competition = form.querySelector('[name="competition"]');
    const phase = form.querySelector('[name="phase"]');
    if (!search || !competition || !phase) return;

    const normalize = value => String(value ?? '').normalize('NFKD')
      .replace(/\p{M}/gu, '').replace(/\u0640/g, '').toLowerCase().trim();
    const groups = [...document.querySelectorAll('section[data-archive-group]')].map(section => ({
      section,
      matches: [...section.querySelectorAll('li[data-archive-match]')].map(element => ({
        element,
        search: normalize(element.getAttribute('data-archive-match')),
        competition: element.getAttribute('data-competition') ?? '',
        phase: element.getAttribute('data-phase') ?? '',
      })),
    }));
    const output = document.querySelector('[data-archive-count]');
    const count = output?.querySelector('[data-archive-count-value], span') ?? output;
    const empty = document.querySelector('[data-archive-empty]');
    let format;
    try {
      format = new Intl.NumberFormat(document.documentElement.lang || 'en', { numberingSystem: 'latn' });
    } catch {
      format = new Intl.NumberFormat('en', { numberingSystem: 'latn' });
    }

    function applyFilters() {
      const terms = normalize(search.value).split(/\s+/).filter(Boolean);
      let visibleCount = 0;
      for (const group of groups) {
        let groupCount = 0;
        for (const match of group.matches) {
          const visible = (!competition.value || match.competition === competition.value)
            && (!phase.value || match.phase === phase.value)
            && terms.every(term => match.search.includes(term));
          match.element.hidden = !visible;
          if (visible) groupCount++;
        }
        group.section.hidden = groupCount === 0;
        visibleCount += groupCount;
      }
      if (count) count.textContent = format.format(visibleCount);
      if (empty) empty.hidden = visibleCount !== 0;
    }

    form.addEventListener('input', applyFilters, { passive: true });
    form.addEventListener('change', applyFilters, { passive: true });
    form.addEventListener('reset', () => {
      // The browser restores default values after dispatching the reset event.
      window.setTimeout(applyFilters, 0);
    }, { passive: true });
    form.addEventListener('submit', event => event.preventDefault());
    form.dataset.archiveReady = 'true';
    applyFilters();
    form.hidden = false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeArchiveFilters, { once: true });
  } else {
    initializeArchiveFilters();
  }
})();
