(() => {
  const panel = document.querySelector('[data-competition-fixtures]');
  if (!panel || location.origin !== 'https://korascoreai.com') return;
  const formatter = new Intl.DateTimeFormat(document.documentElement.lang, {
    dateStyle: 'medium', timeStyle: 'short',
  });
  const endpoint = new URL('https://api.korascoreai.com/functions/v1/public-competition-fixtures');
  endpoint.searchParams.set('league', panel.dataset.competitionFixtures);

  function matchRow(fixture, group, checkedLabel) {
    if (!Number.isSafeInteger(fixture?.id) || fixture.id < 1 || typeof fixture.home !== 'string' ||
        typeof fixture.away !== 'string' || !Number.isFinite(Date.parse(fixture.kickoff))) return null;
    const inPlay = group === 'inPlay';
    const timestamp = inPlay ? fixture.checkedAt : fixture.kickoff;
    if (inPlay) {
      const age = Date.now() - Date.parse(timestamp);
      if (!(age >= 0 && age <= 35 * 60_000)) return null;
    }
    const row = document.createElement('li');
    const heading = document.createElement('div');
    const link = document.createElement('a');
    const home = document.createElement('bdi');
    const away = document.createElement('bdi');
    link.href = `/match/${fixture.id}`;
    home.textContent = fixture.home;
    away.textContent = fixture.away;
    link.append(home, ' – ', away);
    heading.append(link);
    if (group !== 'upcoming') {
      if (!Number.isInteger(fixture.score?.home) || !Number.isInteger(fixture.score?.away)) return null;
      const result = document.createElement('strong');
      result.dir = 'ltr';
      result.textContent = `${fixture.score.home}–${fixture.score.away}`;
      heading.append(result);
    }
    const label = document.createElement('small');
    const date = document.createElement('time');
    date.dateTime = timestamp;
    date.textContent = formatter.format(new Date(timestamp));
    if (inPlay) label.append(`${checkedLabel} · `);
    label.append(date);
    row.append(heading, label);
    return row;
  }

  async function loadMatches() {
    const response = await fetch(endpoint, { credentials: 'omit', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const data = await response.json();
    for (const [key, marker] of [['inPlay', 'in-play'], ['upcoming', 'upcoming'], ['results', 'results']]) {
      if (!Array.isArray(data?.[key])) continue;
      const group = panel.querySelector(`[data-competition-${marker}]`);
      const rows = data[key].slice(0, 8).map(fixture => matchRow(fixture, key, group.dataset.checkedLabel)).filter(Boolean);
      if (!rows.length) continue;
      group.querySelector('ul').append(...rows);
      group.hidden = false;
      panel.hidden = false;
    }
  }
  loadMatches().catch(() => {});
})();
