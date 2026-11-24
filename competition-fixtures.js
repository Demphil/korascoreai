(() => {
  const panel = document.querySelector('[data-competition-fixtures]');
  if (!panel || location.origin !== 'https://korascoreai.com') return;
  const formatter = new Intl.DateTimeFormat(document.documentElement.lang, {
    dateStyle: 'medium', timeStyle: 'short',
  });
  const endpoint = new URL('https://api.korascoreai.com/functions/v1/public-competition-fixtures');
  endpoint.searchParams.set('league', panel.dataset.competitionFixtures);

  function matchTime(timestamp) {
    const time = document.createElement('time');
    time.dateTime = timestamp;
    time.textContent = formatter.format(new Date(timestamp));
    return time;
  }

  function openLigaCredit() {
    const credit = document.createElement('span');
    credit.dataset.competitionSource = 'openligadb';
    const source = document.createElement('a');
    source.href = 'https://www.openligadb.de/en/license';
    source.dir = 'ltr';
    source.textContent = 'OpenLigaDB (ODbL 1.0)';
    credit.append(` · ${panel.dataset.openligaSourceLabel} `, source);
    return credit;
  }

  function matchRow(fixture, group, { checkedLabel, pendingLabel }) {
    const kickoff = Date.parse(fixture?.kickoff);
    if (!Number.isSafeInteger(fixture?.id) || fixture.id < 1 || typeof fixture.home !== 'string' ||
        typeof fixture.away !== 'string' || !Number.isFinite(kickoff)) return null;
    const today = group === 'today';
    const inPlay = group === 'inPlay';
    const now = Date.now();
    const checkAge = now - Date.parse(fixture.checkedAt);
    if (inPlay && !(checkAge >= 0 && checkAge <= 35 * 60_000)) return null;
    const hasScore = Number.isInteger(fixture.score?.home) && Number.isInteger(fixture.score?.away);
    if ((inPlay || group === 'results') && !hasScore) return null;
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
    if (group !== 'upcoming' && hasScore) {
      const result = document.createElement('strong');
      result.dir = 'ltr';
      result.textContent = `${fixture.score.home}–${fixture.score.away}`;
      heading.append(result);
    }
    const label = document.createElement('small');
    if (inPlay) {
      label.append(`${checkedLabel} · `, matchTime(fixture.checkedAt));
    } else {
      label.append(matchTime(fixture.kickoff));
      if (today && (kickoff <= now || hasScore) && checkAge >= 0) {
        label.append(` · ${checkedLabel} `, matchTime(fixture.checkedAt));
      }
      if (today && kickoff <= now && fixture.status === 'NS') label.append(` · ${pendingLabel}`);
    }
    if (hasScore && (today || group === 'results') && fixture.source === 'openligadb' && panel.dataset.openligaSourceLabel) {
      label.append(openLigaCredit());
    }
    row.append(heading, label);
    return row;
  }

  async function loadMatches() {
    const response = await fetch(endpoint, { credentials: 'omit', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const data = await response.json();
    const todayIds = new Set();
    for (const [key, marker] of [['today', 'today'], ['inPlay', 'in-play'], ['upcoming', 'upcoming'], ['results', 'results']]) {
      if (!Array.isArray(data?.[key])) continue;
      const group = panel.querySelector(`[data-competition-${marker}]`);
      if (!group) continue;
      const rows = [];
      for (const fixture of data[key].slice(0, key === 'today' ? 32 : 8)) {
        if (todayIds.has(fixture?.id)) continue;
        const row = matchRow(fixture, key, group.dataset);
        if (!row) continue;
        rows.push(row);
        if (key === 'today') todayIds.add(fixture.id);
      }
      if (!rows.length) continue;
      group.querySelector('ul').append(...rows);
      group.hidden = false;
      panel.hidden = false;
    }
  }
  loadMatches().catch(() => {});
})();
