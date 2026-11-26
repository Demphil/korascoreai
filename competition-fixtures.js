(() => {
  const panel = document.querySelector('[data-competition-fixtures]');
  if (!panel || location.origin !== 'https://korascoreai.com') return;
  const formatter = new Intl.DateTimeFormat(document.documentElement.lang, {
    dateStyle: 'medium', timeStyle: 'short',
  });
  const endpoint = new URL('https://api.korascoreai.com/functions/v1/public-competition-fixtures');
  endpoint.searchParams.set('league', panel.dataset.competitionFixtures);
  const botola = panel.dataset.competitionFixtures === '200';
  const groupLimits = { today: 32, inPlay: 8, upcoming: 8, results: 8 };
  const groupMarkers = { today: 'today', inPlay: 'in-play', upcoming: 'upcoming', results: 'results' };
  const liveStatuses = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE']);
  const finalStatuses = new Set(['FT', 'AET', 'PEN']);
  const minute = 60_000;
  const freshLiveScore = (botola ? 20 : 35) * minute;
  const liveCopy = {
    ar: ['مباشر', 'الاستراحة', 'انتهت', 'تحديث النتيجة متأخر', 'تعذّر تحديث النتائج الآن.'],
    en: ['Live', 'Half-time', 'Final', 'Score update delayed', 'Scores could not be refreshed.'],
    fr: ['En direct', 'Mi-temps', 'Terminé', 'Mise à jour du score en retard', 'Les scores n’ont pas pu être actualisés.'],
    es: ['En directo', 'Descanso', 'Finalizado', 'Actualización del marcador retrasada', 'No se pudieron actualizar los marcadores.'],
  };
  const [liveLabel, halftimeLabel, finalLabel, delayedLabel, unavailableLabel] =
    liveCopy[document.documentElement.lang] ?? liveCopy.en;

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
    if (inPlay && !(checkAge >= 0 && checkAge <= freshLiveScore)) return null;
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
      if (botola) {
        label.append(fixture.status === 'HT' ? halftimeLabel : liveLabel);
        if (fixture.status !== 'HT' && Number.isInteger(fixture.elapsed) && fixture.elapsed >= 0 && fixture.elapsed <= 150) {
          const clock = document.createElement('bdi');
          const extra = Number.isInteger(fixture.extra) && fixture.extra > 0 && fixture.extra <= 30 ? `+${fixture.extra}` : '';
          clock.textContent = `${fixture.elapsed}${extra}′`;
          label.append(' ', clock);
        }
        label.append(' · ');
      }
      label.append(`${checkedLabel} · `, matchTime(fixture.checkedAt));
    } else {
      if (botola && hasScore && finalStatuses.has(fixture.status)) label.append(`${finalLabel} · `);
      label.append(matchTime(fixture.kickoff));
      if (today && (kickoff <= now || hasScore) && checkAge >= 0) {
        label.append(` · ${checkedLabel} `, matchTime(fixture.checkedAt));
      }
      if (today && kickoff <= now && fixture.status === 'NS') label.append(` · ${pendingLabel}`);
      if (botola && today && liveStatuses.has(fixture.status)) label.append(` · ${delayedLabel}`);
    }
    if (hasScore && (today || group === 'results') && fixture.source === 'openligadb' && panel.dataset.openligaSourceLabel) {
      label.append(openLigaCredit());
    }
    row.append(heading, label);
    return row;
  }

  function renderStandings(data) {
    const section = panel.querySelector('[data-competition-standings]');
    const checkedAt = Date.parse(data?.checkedAt);
    if (!section || !Number.isFinite(checkedAt) || checkedAt > Date.now() ||
        !Array.isArray(data.rows) || data.rows.length !== 16) return;
    if (Date.parse(section.querySelector('time')?.dateTime) >= checkedAt) return;
    const ranks = new Set();
    const clubs = new Set();
    for (const item of data.rows) {
      const { rank, team, played, points } = item ?? {};
      if (!Number.isInteger(rank) || rank < 1 || rank > 16 || ranks.has(rank) ||
          !Number.isSafeInteger(team?.id) || team.id < 1 || clubs.has(team.id) ||
          typeof team.name !== 'string' || !team.name.trim() || team.name.length > 160 ||
          !Number.isInteger(played) || played < 0 || !Number.isInteger(points)) return;
      ranks.add(rank);
      clubs.add(team.id);
    }
    const rows = [...data.rows].sort((a, b) => a.rank - b.rank).map(({ rank, team, played, points }) => {
      const row = document.createElement('tr');
      for (const [value, club] of [[rank, false], [team.name, true], [played, false], [points, false]]) {
        const cell = document.createElement(club ? 'th' : 'td');
        if (club) {
          cell.scope = 'row';
          const label = document.createElement('bdi');
          label.textContent = value;
          cell.append(label);
        } else {
          cell.textContent = String(value);
        }
        row.append(cell);
      }
      return row;
    });
    section.querySelector('tbody').replaceChildren(...rows);
    section.querySelector('time').replaceWith(matchTime(data.checkedAt));
    section.hidden = false;
    panel.hidden = false;
  }

  function renderMatches(data) {
    renderStandings(data?.standings);
    const sections = botola ? ['inPlay', 'results', 'today', 'upcoming'] : ['today', 'inPlay', 'upcoming', 'results'];
    const displayedIds = new Set();
    const terminalIds = botola
      ? new Set([...data.today, ...data.results].filter(row => finalStatuses.has(row?.status)).map(row => row.id))
      : new Set();
    const active = document.activeElement;
    const focusedMatch = active?.matches('li a') && panel.contains(active) ? active.getAttribute('href') : null;
    for (const key of sections) {
      if (!Array.isArray(data?.[key])) continue;
      const group = panel.querySelector(`[data-competition-${groupMarkers[key]}]`);
      if (!group) continue;
      const rows = [];
      for (const fixture of data[key].slice(0, groupLimits[key])) {
        const terminalConflict = terminalIds.has(fixture?.id) && !finalStatuses.has(fixture?.status);
        if (displayedIds.has(fixture?.id) || terminalConflict) continue;
        const row = matchRow(fixture, key, group.dataset);
        if (!row) continue;
        rows.push(row);
        if (botola || key === 'today') displayedIds.add(fixture.id);
      }
      const list = group.querySelector('ul');
      if (botola) {
        if (list.innerHTML !== rows.map(row => row.outerHTML).join('')) list.replaceChildren(...rows);
        group.hidden = !rows.length;
      } else if (rows.length) {
        list.append(...rows);
        group.hidden = false;
      }
      if (rows.length) panel.hidden = false;
    }
    if (focusedMatch && document.activeElement !== active) {
      [...panel.querySelectorAll('li a')].find(link => link.getAttribute('href') === focusedMatch)
        ?.focus({ preventScroll: true });
    }
  }

  async function loadMatches() {
    const response = await fetch(endpoint, { credentials: 'omit', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Match feed unavailable');
    const data = await response.json();
    if (botola && !Object.keys(groupLimits).every(key => Array.isArray(data?.[key]))) {
      throw new Error('Match feed incomplete');
    }
    renderMatches(data);
    return data;
  }

  if (!botola) {
    loadMatches().catch(() => {});
    return;
  }

  const notice = document.createElement('p');
  notice.className = 'record-clock';
  notice.setAttribute('role', 'status');
  notice.textContent = unavailableLabel;
  notice.hidden = true;
  panel.append(notice);
  const activeInterval = 30_000;
  const idleInterval = 180_000;
  let refreshInterval = idleInterval;
  let lastReadAt = -Infinity;
  let lastData;
  let timer;
  let refreshing = false;

  function scheduleRefresh() {
    clearTimeout(timer);
    if (!document.hidden && !refreshing) {
      timer = setTimeout(refresh, Math.max(0, refreshInterval - (Date.now() - lastReadAt)));
    }
  }

  async function refresh() {
    if (document.hidden || refreshing) return;
    refreshing = true;
    lastReadAt = Date.now();
    try {
      const data = lastData = await loadMatches();
      const now = Date.now();
      const kickoffOffsets = [...data.today, ...data.upcoming]
        .filter(row => row?.status === 'NS').map(row => Date.parse(row.kickoff) - now)
        .filter(offset => offset >= -20 * minute);
      const untilKickoff = Math.min(...kickoffOffsets);
      const activeMatch = panel.querySelector('[data-competition-in-play]')?.hidden === false || data.today.some(row =>
        liveStatuses.has(row?.status) && Date.parse(row.kickoff) > now - 6 * 60 * minute);
      refreshInterval = activeMatch ? activeInterval
        : Math.min(idleInterval, Math.max(activeInterval, untilKickoff - 2 * minute));
      notice.hidden = true;
    } catch {
      refreshInterval = idleInterval;
      if (lastData) renderMatches(lastData);
      notice.hidden = false;
      panel.hidden = false;
    } finally {
      refreshing = false;
      scheduleRefresh();
    }
  }

  document.addEventListener('visibilitychange', scheduleRefresh);
  refresh();
})();
