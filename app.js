const STORAGE_KEY = 'pitchtrack-game-v1';
const GAMES_KEY = 'pitchtrack-games-v1';
const TEAMS_KEY = 'pitchtrack-teams-v1';
const $ = (id) => document.getElementById(id);
let playerIdSeed = 0;
const createPlayerId = (kind) => `${kind}-${Date.now().toString(36)}-${++playerIdSeed}`;
const createLineup = () => ({
  batters: Array.from({length: 9}, () => ({id: createPlayerId('batter'), name: '', number: '', position: '', bats: 'R'})),
  pitchers: Array.from({length: 6}, () => ({id: createPlayerId('pitcher'), name: '', number: '', throws: 'R'}))
});

const state = {
  pitches: [], location: null, pitchType: 'Four-seam', pitchGroup: 'fastball', result: null, contactType: null, outLocation: '', errorLocation: '',
  balls: 0, strikes: 0, outs: 0,
  lineups: {home: createLineup(), away: createLineup()},
  battingIndexes: {home: 0, away: 0},
  selectedPitchers: {home: '', away: ''},
  uiHidden: {zone: false, history: false, boxScore: false}
};
let editingTeam = 'away';
let lineupSnapshot = null;
let lineupSituationSnapshot = null;
let activeGameId = '';
let savedGames = [];
let savedTeams = [];
let editingSavedTeamId = null;
let editingTeamRoster = null;

const fields = ['homeTeam', 'awayTeam', 'gameDate', 'inning', 'half', 'pitcher', 'batter', 'bats'];
const today = new Date();
$('gameDate').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
for (let i = 1; i <= 12; i++) $('inning').add(new Option(i, i));
for (let mph = 110; mph >= 30; mph--) {
  $('velocity').add(new Option(`${mph} mph`, mph));
  $('editVelocity').add(new Option(`${mph} mph`, mph));
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function todayValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function createGameId() { return `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`; }
function createTeamId() { return `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`; }

function blankGameData() {
  return {
    pitches: [], balls: 0, strikes: 0, outs: 0,
    lineups: {home: createLineup(), away: createLineup()},
    battingIndexes: {home: 0, away: 0},
    selectedPitchers: {home: '', away: ''},
    uiHidden: clone(state.uiHidden),
    fields: {homeTeam: '', awayTeam: '', gameDate: todayValue(), inning: '1', half: 'Top', pitcher: '', batter: '', bats: 'R'}
  };
}

function currentGameData() {
  return {
    pitches: state.pitches, balls: state.balls, strikes: state.strikes, outs: state.outs,
    lineups: state.lineups, battingIndexes: state.battingIndexes, selectedPitchers: state.selectedPitchers,
    uiHidden: state.uiHidden,
    fields: Object.fromEntries(fields.map(id => [id, $(id).value]))
  };
}

function currentGameSituation() {
  return {
    balls: state.balls,
    strikes: state.strikes,
    outs: state.outs,
    inning: $('inning').value,
    half: $('half').value,
    pitcher: $('pitcher').value,
    batter: $('batter').value,
    bats: $('bats').value,
    battingIndexes: clone(state.battingIndexes),
    selectedPitchers: clone(state.selectedPitchers)
  };
}

function restoreGameSituation(situation) {
  state.balls = situation.balls;
  state.strikes = situation.strikes;
  state.outs = situation.outs;
  state.battingIndexes = clone(situation.battingIndexes);
  state.selectedPitchers = clone(situation.selectedPitchers);
  $('inning').value = situation.inning;
  $('half').value = situation.half;
  renderLineupOptions();
  if ([...$('pitcher').options].some(option => option.value === situation.pitcher)) $('pitcher').value = situation.pitcher;
  if ([...$('batter').options].some(option => option.value === situation.batter)) $('batter').value = situation.batter;
  $('bats').value = situation.bats || 'R';
  updateOutButtons();
}

function gameTitle(data = currentGameData()) {
  const home = data.fields?.homeTeam?.trim() || 'Home';
  const away = data.fields?.awayTeam?.trim() || 'Away';
  const date = data.fields?.gameDate || todayValue();
  return `${away} at ${home} · ${date}`;
}

function fileSafeName(value) {
  return String(value || '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'team';
}

function gameFileBase() {
  const date = $('gameDate').value || todayValue();
  const away = fileSafeName($('awayTeam').value || 'Away');
  const home = fileSafeName($('homeTeam').value || 'Home');
  return `${date}_${away}-at-${home}`;
}

function applyGameData(data) {
  state.pitches = data.pitches || [];
  state.balls = data.balls || 0;
  state.strikes = data.strikes || 0;
  state.outs = data.outs || 0;
  state.lineups = data.lineups || {home: createLineup(), away: createLineup()};
  state.battingIndexes = data.battingIndexes || {home: 0, away: 0};
  state.selectedPitchers = data.selectedPitchers || {home: '', away: ''};
  state.uiHidden = {...state.uiHidden, ...(data.uiHidden || {})};
  fields.forEach(id => { if (data.fields?.[id] !== undefined) $(id).value = data.fields[id]; });
  if (!$('inning').value) $('inning').value = '1';
  if (!$('gameDate').value) $('gameDate').value = todayValue();
  ensurePlayerLinks();
  renderLineupOptions();
  updateOutButtons();
  syncPlayersForHalf();
  updateLineupLabels();
  render();
}

function updateActiveGameRecord() {
  if (!activeGameId) activeGameId = createGameId();
  const data = currentGameData();
  const existing = savedGames.find(game => game.id === activeGameId);
  const record = {id: activeGameId, title: gameTitle(data), updatedAt: new Date().toISOString(), pitches: data.pitches.length, data};
  if (existing) Object.assign(existing, record);
  else savedGames.unshift(record);
}

function persistGames() {
  updateActiveGameRecord();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentGameData()));
  localStorage.setItem(GAMES_KEY, JSON.stringify({activeGameId, games: savedGames}));
  renderGamesList();
}

function renderGamesList() {
  if (!$('gamesList')) return;
  updateActiveGameRecord();
  const active = savedGames.find(game => game.id === activeGameId);
  $('activeGameTitle').textContent = active?.title || gameTitle();
  $('activeGameMeta').textContent = `${active?.pitches || state.pitches.length} pitch${(active?.pitches || state.pitches.length) === 1 ? '' : 'es'} saved`;
  $('gamesList').innerHTML = savedGames.map((game) => `
    <div class="game-row ${game.id === activeGameId ? 'active' : ''}" data-game-id="${escapeHtml(game.id)}">
      <div><strong>${escapeHtml(game.title)}</strong><small>${game.pitches || 0} pitches${game.id === activeGameId ? ' · current' : ''}</small></div>
      <div class="game-row-actions">
        <button class="game-action" data-open-game="${escapeHtml(game.id)}" type="button">${game.id === activeGameId ? 'Open' : 'Switch'}</button>
        <button class="game-action danger" data-delete-game="${escapeHtml(game.id)}" type="button" ${savedGames.length <= 1 ? 'disabled' : ''}>Delete</button>
      </div>
    </div>`).join('');
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $('installButton').textContent = '＋ Install App';
});
$('installButton').addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  } else {
    $('installDialog').showModal();
  }
});
$('closeInstall').addEventListener('click', () => $('installDialog').close());
$('doneInstall').addEventListener('click', () => $('installDialog').close());
$('installDialog').addEventListener('click', (event) => { if (event.target === $('installDialog')) $('installDialog').close(); });
$('gamesButton').addEventListener('click', () => { save(); renderGamesList(); $('gamesDialog').showModal(); });
$('closeGames').addEventListener('click', () => $('gamesDialog').close());
$('cancelGames').addEventListener('click', () => $('gamesDialog').close());
$('gamesDialog').addEventListener('click', (event) => { if (event.target === $('gamesDialog')) $('gamesDialog').close(); });
$('newGameButton').addEventListener('click', () => {
  save();
  if (state.pitches.length && !confirm('Create a new game? Your current game will stay saved.')) return;
  activeGameId = createGameId();
  savedGames.unshift({id: activeGameId, title: 'New game', updatedAt: new Date().toISOString(), pitches: 0, data: blankGameData()});
  applyGameData(savedGames[0].data);
  save();
  $('gamesDialog').close();
  showToast('New game ready');
});
$('gamesList').addEventListener('click', (event) => {
  const openButton = event.target.closest('[data-open-game]');
  const deleteButton = event.target.closest('[data-delete-game]');
  if (openButton) {
    save();
    const game = savedGames.find(item => item.id === openButton.dataset.openGame);
    if (!game) return;
    activeGameId = game.id;
    applyGameData(clone(game.data));
    save();
    $('gamesDialog').close();
    showToast(`Opened ${game.title}`);
    return;
  }
  if (deleteButton) {
    if (savedGames.length <= 1) return showToast('Keep at least one game saved');
    const game = savedGames.find(item => item.id === deleteButton.dataset.deleteGame);
    if (!game || !confirm(`Delete saved game "${game.title}"?`)) return;
    savedGames = savedGames.filter(item => item.id !== game.id);
    if (activeGameId === game.id) {
      activeGameId = savedGames[0].id;
      applyGameData(clone(savedGames[0].data));
    }
    persistGames();
    showToast('Saved game deleted');
  }
});

function teamPlayerCounts(lineup) {
  const batters = (lineup?.batters || []).filter(player => player.name).length;
  const pitchers = (lineup?.pitchers || []).filter(player => player.name).length;
  return {batters, pitchers};
}

function lineupHasRoster(lineup) {
  const counts = teamPlayerCounts(lineup);
  return counts.batters || counts.pitchers;
}

function teamSideName(side) {
  return $(side === 'home' ? 'homeTeam' : 'awayTeam').value.trim() || `${capitalize(side)} Team`;
}

function playerDetails(player = {}) {
  return {
    dob: player.dob || '',
    height: player.height || '',
    weight: player.weight || '',
    hometown: player.hometown || ''
  };
}

function cleanLineupForTeam(lineup) {
  return {
    batters: clone(lineup.batters || []).map(player => ({
      id: createPlayerId('batter'),
      name: player.name || '',
      number: player.number || '',
      position: player.position || '',
      bats: player.bats || 'R',
      throws: player.throws || 'R',
      ...playerDetails(player)
    })),
    pitchers: clone(lineup.pitchers || []).map(player => ({
      id: createPlayerId('pitcher'),
      name: player.name || '',
      number: player.number || '',
      position: player.position || 'P',
      bats: player.bats || 'R',
      throws: player.throws || 'R',
      ...playerDetails(player)
    }))
  };
}

function loadTeams() {
  try {
    const store = JSON.parse(localStorage.getItem(TEAMS_KEY));
    savedTeams = Array.isArray(store?.teams) ? store.teams : [];
  } catch (_) {
    savedTeams = [];
  }
  renderSavedPlayerLists();
}

function persistTeams() {
  localStorage.setItem(TEAMS_KEY, JSON.stringify({teams: savedTeams}));
  renderTeamsList();
  renderSavedPlayerLists();
}

function savedRosterPlayers(kind) {
  const collection = kind === 'batter' ? 'batters' : 'pitchers';
  const seen = new Set();
  const players = [];
  savedTeams.forEach((team) => {
    (team.lineup?.[collection] || []).forEach((player) => {
      if (!player.name?.trim()) return;
      const key = `${normalizePlayerName(player.name)}|${player.number || ''}|${kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      players.push({...player, teamName: team.name});
    });
  });
  return players.sort((a, b) => a.name.localeCompare(b.name));
}

function rosterPlayersForLineupSide(kind, side = editingTeam) {
  const collection = kind === 'batter' ? 'batters' : 'pitchers';
  const team = savedTeamForSide(side);
  if (!team) return savedRosterPlayers(kind);
  return (team.lineup?.[collection] || [])
    .filter(player => player.name?.trim())
    .map(player => ({...player, teamName: team.name}))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderLineupRosterChoices(side = editingTeam) {
  const batterList = $('savedBatterPlayers');
  const pitcherList = $('savedPitcherPlayers');
  if (batterList) {
    batterList.innerHTML = rosterPlayersForLineupSide('batter', side).map(player =>
      `<option value="${escapeHtml(player.name)}" label="${escapeHtml(`${player.number ? `#${player.number} ` : ''}${player.teamName || 'Saved team'}${player.position ? ` · ${player.position}` : ''}`)}"></option>`
    ).join('');
  }
  if (pitcherList) {
    pitcherList.innerHTML = rosterPlayersForLineupSide('pitcher', side).map(player =>
      `<option value="${escapeHtml(player.name)}" label="${escapeHtml(`${player.number ? `#${player.number} ` : ''}${player.teamName || 'Saved team'}${player.throws ? ` · ${player.throws}HP` : ''}`)}"></option>`
    ).join('');
  }
}

function renderSavedPlayerLists() {
  renderLineupRosterChoices(editingTeam);
  renderTeamPickers();
}

function savedTeamForSide(side) {
  const teamName = teamDisplayName(side);
  return savedTeams.find(team => normalizePlayerName(team.name) === normalizePlayerName(teamName)) || null;
}

function findSavedRosterPlayer(kind, name, side = editingTeam) {
  const normalized = normalizePlayerName(name);
  if (!normalized) return null;
  const sideTeam = savedTeamForSide(side);
  const collection = kind === 'batter' ? 'batters' : 'pitchers';
  const teamMatch = sideTeam?.lineup?.[collection]?.find(player => normalizePlayerName(player.name) === normalized);
  if (teamMatch) return {...teamMatch, teamName: sideTeam.name};
  if (sideTeam) return null;
  return savedRosterPlayers(kind).find(player => normalizePlayerName(player.name) === normalized) || null;
}

function quickAddLineupPlayerToRoster(input) {
  const name = input.value.trim();
  if (!name) return;
  const kind = input.dataset.kind;
  const side = editingTeam;
  const teamName = teamDisplayName(side);
  if (!confirm(`${name} is not in the ${teamName} saved roster. Add quickly now?`)) return;
  const row = input.closest('.lineup-row');
  let team = savedTeamForSide(side);
  if (!team) {
    team = {id: createTeamId(), name: teamName, updatedAt: new Date().toISOString(), lineup: blankTeamRoster()};
    savedTeams.unshift(team);
  }
  const player = kind === 'batter'
    ? {
        id: createPlayerId('batter'),
        name,
        number: row.querySelector('.lineup-number').value.trim(),
        position: row.querySelector('.lineup-position').value.trim().toUpperCase(),
        bats: row.querySelector('.lineup-bats').value || 'R',
        throws: 'R',
        dob: '',
        height: '',
        weight: '',
        hometown: ''
      }
    : {
        id: createPlayerId('pitcher'),
        name,
        number: row.querySelector('.lineup-number').value.trim(),
        position: 'P',
        bats: 'R',
        throws: row.querySelector('.lineup-throws').value || 'R',
        dob: '',
        height: '',
        weight: '',
        hometown: ''
      };
  upsertSavedRosterPlayer(team, player, kind);
  team.updatedAt = new Date().toISOString();
  persistTeams();
  showToast(`${name} added to ${team.name}`);
}

function fillLineupPlayerFromSaved(input) {
  const kind = input.dataset.kind;
  if (isDuplicateLineupInput(input)) {
    const name = input.value.trim();
    input.value = '';
    updateLineupCount();
    return showToast(`${name} is already in this lineup`);
  }
  const player = findSavedRosterPlayer(kind, input.value, editingTeam);
  if (!player) return quickAddLineupPlayerToRoster(input);
  const row = input.closest('.lineup-row');
  row.querySelector('.lineup-number').value = player.number || '';
  if (kind === 'batter') {
    row.querySelector('.lineup-position').value = player.position || '';
    row.querySelector('.lineup-bats').value = player.bats || 'R';
  } else {
    row.querySelector('.lineup-throws').value = player.throws || 'R';
  }
  updateLineupCount();
}

function isDuplicateLineupInput(input) {
  const name = normalizePlayerName(input.value);
  if (!name) return false;
  const list = input.dataset.kind === 'batter' ? $('battingLineup') : $('pitchingStaff');
  return [...list.querySelectorAll('.lineup-name')].some(other => other !== input && normalizePlayerName(other.value) === name);
}

function validateNoDuplicateLineupPlayers(team = editingTeam) {
  const lineup = state.lineups[team];
  for (const collectionName of ['batters', 'pitchers']) {
    const seen = new Set();
    for (const player of lineup[collectionName]) {
      const name = normalizePlayerName(player.name);
      if (!name) continue;
      if (seen.has(name)) {
        showToast(`${player.name} is repeated. A player can only be once in the ${collectionName === 'batters' ? 'batting order' : 'pitching staff'}.`);
        return false;
      }
      seen.add(name);
    }
  }
  return true;
}

function lineupPlayerToRosterPlayer(player, kind) {
  return {
    id: player.id || createPlayerId(kind),
    name: player.name || '',
    number: player.number || '',
    dob: player.dob || '',
    position: kind === 'pitcher' ? (player.position || 'P') : (player.position || ''),
    bats: player.bats || 'R',
    throws: player.throws || 'R',
    height: player.height || '',
    weight: player.weight || '',
    hometown: player.hometown || ''
  };
}

function upsertSavedRosterPlayer(team, player, kind) {
  if (!player.name?.trim()) return;
  const collection = kind === 'batter' ? team.lineup.batters : team.lineup.pitchers;
  const match = collection.find(existing =>
    (player.id && existing.id === player.id) ||
    normalizePlayerName(existing.name) === normalizePlayerName(player.name) ||
    (player.number && existing.number && String(existing.number) === String(player.number))
  );
  const rosterPlayer = lineupPlayerToRosterPlayer(player, kind);
  if (match) Object.assign(match, {...match, ...rosterPlayer, id: match.id || rosterPlayer.id});
  else collection.push(rosterPlayer);
}

function syncLineupToSavedRoster(side) {
  const teamName = teamDisplayName(side);
  if (!teamName.trim()) return;
  let team = savedTeamForSide(side);
  if (!team) {
    team = {id: createTeamId(), name: teamName, updatedAt: new Date().toISOString(), lineup: blankTeamRoster()};
    savedTeams.unshift(team);
  }
  state.lineups[side].batters.forEach(player => upsertSavedRosterPlayer(team, player, 'batter'));
  state.lineups[side].pitchers.forEach(player => upsertSavedRosterPlayer(team, player, 'pitcher'));
  team.updatedAt = new Date().toISOString();
}

function renderTeamsList() {
  if (!$('teamsList')) return;
  if (!savedTeams.length) {
    $('teamsList').innerHTML = '<div class="teams-empty">No saved teams yet. Enter a team name, tap Create / edit team, and add players.</div>';
    return;
  }
  $('teamsList').innerHTML = savedTeams.map((team) => {
    const counts = teamPlayerCounts(team.lineup);
    return `
      <div class="team-row" data-team-id="${escapeHtml(team.id)}">
        <div><strong>${escapeHtml(team.name)}</strong><small>${counts.batters} batters · ${counts.pitchers} pitchers</small></div>
        <div class="team-row-actions">
          <button class="game-action" data-edit-team type="button">Edit players</button>
          <button class="game-action" data-load-team="home" type="button">Load Home</button>
          <button class="game-action" data-load-team="away" type="button">Load Away</button>
          <button class="game-action danger" data-delete-team type="button">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function blankTeamRoster() {
  return {batters: [], pitchers: []};
}

function blankRosterPlayer(kind = 'batter') {
  return {name: '', number: '', dob: '', position: kind === 'pitcher' ? 'P' : '', bats: 'R', throws: 'R', height: '', weight: '', hometown: ''};
}

function teamBatterRow(player = {}, index = 0) {
  return `
    <div class="team-player-row batter">
      <span class="order-number">${index + 1}</span>
      <input class="team-player-name" value="${escapeHtml(player.name || '')}" placeholder="Player name" maxlength="50">
      <input class="team-player-number" value="${escapeHtml(player.number || '')}" placeholder="#" maxlength="3" inputmode="numeric">
      <input class="team-player-dob" value="${escapeHtml(player.dob || '')}" placeholder="DOB">
      <select class="team-player-position">${positionOptions(player.position || '')}</select>
      <select class="team-player-bats"><option ${player.bats === 'R' ? 'selected' : ''}>R</option><option ${player.bats === 'L' ? 'selected' : ''}>L</option><option ${player.bats === 'S' ? 'selected' : ''}>S</option></select>
      <select class="team-player-throws"><option ${player.throws === 'R' ? 'selected' : ''}>R</option><option ${player.throws === 'L' ? 'selected' : ''}>L</option></select>
      <input class="team-player-height" value="${escapeHtml(player.height || '')}" placeholder="Ht">
      <input class="team-player-weight" value="${escapeHtml(player.weight || '')}" placeholder="Wt" inputmode="numeric">
      <input class="team-player-hometown" value="${escapeHtml(player.hometown || '')}" placeholder="Hometown" maxlength="50">
      <button class="remove-player" data-remove-team-player type="button" title="Remove player">×</button>
    </div>`;
}

function teamPitcherRow(player = {}, index = 0) {
  return `
    <div class="team-player-row pitcher">
      <span class="order-number">${index + 1}</span>
      <input class="team-player-name" value="${escapeHtml(player.name || '')}" placeholder="Pitcher name" maxlength="50">
      <input class="team-player-number" value="${escapeHtml(player.number || '')}" placeholder="#" maxlength="3" inputmode="numeric">
      <input class="team-player-dob" value="${escapeHtml(player.dob || '')}" placeholder="DOB">
      <select class="team-player-position">${positionOptions(player.position || 'P')}</select>
      <select class="team-player-bats"><option ${player.bats === 'R' ? 'selected' : ''}>R</option><option ${player.bats === 'L' ? 'selected' : ''}>L</option><option ${player.bats === 'S' ? 'selected' : ''}>S</option></select>
      <select class="team-player-throws"><option ${player.throws === 'R' ? 'selected' : ''}>R</option><option ${player.throws === 'L' ? 'selected' : ''}>L</option></select>
      <input class="team-player-height" value="${escapeHtml(player.height || '')}" placeholder="Ht">
      <input class="team-player-weight" value="${escapeHtml(player.weight || '')}" placeholder="Wt" inputmode="numeric">
      <input class="team-player-hometown" value="${escapeHtml(player.hometown || '')}" placeholder="Hometown" maxlength="50">
      <button class="remove-player" data-remove-team-player type="button" title="Remove pitcher">×</button>
    </div>`;
}

function renderTeamEditor() {
  const name = $('teamNameInput').value.trim() || 'New team';
  $('teamEditorTitle').textContent = `Edit ${name}`;
  $('teamBatters').innerHTML = (editingTeamRoster?.batters || []).map(teamBatterRow).join('');
  $('teamPitchers').innerHTML = (editingTeamRoster?.pitchers || []).map(teamPitcherRow).join('');
  if ($('teamsStartCard')) $('teamsStartCard').hidden = true;
  $('teamEditor').hidden = false;
}

function parseBatchPlayers(text) {
  return String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean).map((line) => {
    const cleaned = line.replace(/^#/, '').trim();
    let number = '';
    let name = cleaned;
    const commaMatch = cleaned.match(/^(\d{1,3})\s*,\s*(.+)$/);
    const spacedMatch = cleaned.match(/^(\d{1,3})\s+(.+)$/);
    if (commaMatch) {
      number = commaMatch[1];
      name = commaMatch[2];
    } else if (spacedMatch) {
      number = spacedMatch[1];
      name = spacedMatch[2];
    }
    return {name: name.trim(), number: number.trim()};
  }).filter(player => player.name);
}

function batchAddTeamPlayers(kind) {
  if (!editingTeamRoster) beginTeamEdit();
  readTeamEditor();
  const players = parseBatchPlayers($('teamBatchInput').value);
  if (!players.length) return showToast('Paste player names first');
  if (kind === 'batter') {
    editingTeamRoster.batters.push(...players.map(player => ({...blankRosterPlayer('batter'), ...player})));
  } else {
    editingTeamRoster.pitchers.push(...players.map(player => ({...blankRosterPlayer('pitcher'), ...player})));
  }
  $('teamBatchInput').value = '';
  renderTeamEditor();
  showToast(`${players.length} player${players.length === 1 ? '' : 's'} added`);
}

function readTeamEditor() {
  if (!editingTeamRoster) editingTeamRoster = blankTeamRoster();
  editingTeamRoster.batters = [...$('teamBatters').querySelectorAll('.team-player-row')].map(row => ({
    id: createPlayerId('batter'),
    name: row.querySelector('.team-player-name').value.trim(),
    number: row.querySelector('.team-player-number').value.trim(),
    dob: row.querySelector('.team-player-dob').value.trim(),
    position: row.querySelector('.team-player-position').value.trim().toUpperCase(),
    bats: row.querySelector('.team-player-bats').value,
    throws: row.querySelector('.team-player-throws').value,
    height: row.querySelector('.team-player-height').value.trim(),
    weight: row.querySelector('.team-player-weight').value.trim(),
    hometown: row.querySelector('.team-player-hometown').value.trim()
  })).filter(player => player.name || player.number || player.position || player.dob || player.height || player.weight || player.hometown);
  editingTeamRoster.pitchers = [...$('teamPitchers').querySelectorAll('.team-player-row')].map(row => ({
    id: createPlayerId('pitcher'),
    name: row.querySelector('.team-player-name').value.trim(),
    number: row.querySelector('.team-player-number').value.trim(),
    dob: row.querySelector('.team-player-dob').value.trim(),
    position: row.querySelector('.team-player-position').value.trim().toUpperCase(),
    bats: row.querySelector('.team-player-bats').value,
    throws: row.querySelector('.team-player-throws').value,
    height: row.querySelector('.team-player-height').value.trim(),
    weight: row.querySelector('.team-player-weight').value.trim(),
    hometown: row.querySelector('.team-player-hometown').value.trim()
  })).filter(player => player.name || player.number || player.position || player.dob || player.height || player.weight || player.hometown);
}

function beginTeamEdit(team = null) {
  editingSavedTeamId = team?.id || null;
  $('teamNameInput').value = team?.name || $('teamNameInput').value.trim() || '';
  editingTeamRoster = team ? cleanLineupForTeam(team.lineup) : blankTeamRoster();
  if (!editingTeamRoster.batters.length) editingTeamRoster.batters.push(blankRosterPlayer('batter'));
  if (!editingTeamRoster.pitchers.length) editingTeamRoster.pitchers.push(blankRosterPlayer('pitcher'));
  renderTeamEditor();
  $('teamNameInput').focus();
}

function cancelTeamEdit() {
  editingSavedTeamId = null;
  editingTeamRoster = null;
  $('teamEditor').hidden = true;
  if ($('teamsStartCard')) $('teamsStartCard').hidden = false;
}

function saveTeamEditorRoster() {
  const name = $('teamNameInput').value.trim();
  if (!name) return showToast('Enter a team name first');
  readTeamEditor();
  if (!lineupHasRoster(editingTeamRoster)) return showToast('Add at least one player');
  const existing = savedTeams.find(team => team.id === editingSavedTeamId || team.name.toLowerCase() === name.toLowerCase());
  const record = {id: existing?.id || createTeamId(), name, updatedAt: new Date().toISOString(), lineup: cleanLineupForTeam(editingTeamRoster)};
  if (existing) Object.assign(existing, record);
  else savedTeams.unshift(record);
  editingSavedTeamId = record.id;
  editingTeamRoster = cleanLineupForTeam(record.lineup);
  persistTeams();
  renderTeamEditor();
  showToast(`${name} saved`);
}

function saveLineupAsTeam(side) {
  const lineup = state.lineups[side];
  if (!lineupHasRoster(lineup)) return showToast(`Add players to the ${side} lineup first`);
  const name = $('teamNameInput').value.trim() || teamSideName(side);
  const existing = savedTeams.find(team => team.name.toLowerCase() === name.toLowerCase());
  const record = {id: existing?.id || createTeamId(), name, updatedAt: new Date().toISOString(), lineup: cleanLineupForTeam(lineup)};
  if (existing) Object.assign(existing, record);
  else savedTeams.unshift(record);
  persistTeams();
  showToast(`${name} saved`);
}

function loadTeamIntoSide(teamId, side) {
  const team = savedTeams.find(item => item.id === teamId);
  if (!team) return;
  if (state.pitches.length && !confirm(`Load ${team.name} into ${capitalize(side)}? This changes the current game's ${side} lineup.`)) return;
  state.lineups[side] = cleanLineupForTeam(team.lineup);
  $(side === 'home' ? 'homeTeam' : 'awayTeam').value = team.name;
  state.battingIndexes[side] = 0;
  state.selectedPitchers[side] = '';
  renderLineupOptions();
  syncPlayersForHalf();
  updateLineupLabels();
  render();
  save();
  if ($('teamsDialog').open) $('teamsDialog').close();
  showToast(`${team.name} loaded to ${capitalize(side)}`);
}

function loadSavedTeamFromName(side) {
  const input = $(side === 'home' ? 'homeTeam' : 'awayTeam');
  const team = savedTeams.find(item => normalizePlayerName(item.name) === normalizePlayerName(input.value));
  if (!team) return;
  loadTeamIntoSide(team.id, side);
}

function teamPickerMenu(side) {
  return $(side === 'home' ? 'homeTeamMenu' : 'awayTeamMenu');
}

function renderTeamPicker(side) {
  const input = $(side === 'home' ? 'homeTeam' : 'awayTeam');
  const menu = teamPickerMenu(side);
  if (!input || !menu) return;
  const query = normalizePlayerName(input.value);
  const rawName = input.value.trim();
  const teams = savedTeams
    .filter(team => team.name?.trim())
    .filter(team => !query || normalizePlayerName(team.name).includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!savedTeams.length) {
    menu.innerHTML = `<div class="team-picker-empty">No saved teams yet.</div><button class="team-picker-option" type="button" data-create-team-from-picker="${side}"><strong>＋ Add${rawName ? ` "${escapeHtml(rawName)}"` : ' a team'}</strong><small>Create saved team roster</small></button><button class="team-picker-option" type="button" data-open-teams-from-picker><strong>Manage Teams</strong><small>Open roster manager</small></button>`;
    return;
  }
  if (!teams.length) {
    menu.innerHTML = `<div class="team-picker-empty">No team matches this name.</div><button class="team-picker-option" type="button" data-create-team-from-picker="${side}"><strong>＋ Add "${escapeHtml(rawName)}"</strong><small>Create saved team roster</small></button><button class="team-picker-option" type="button" data-open-teams-from-picker><strong>Manage Teams</strong><small>Open roster manager</small></button>`;
    return;
  }
  menu.innerHTML = teams.map((team) => {
    const counts = teamPlayerCounts(team.lineup);
    return `<button class="team-picker-option" type="button" data-team-picker="${side}" data-team-id="${escapeHtml(team.id)}"><strong>${escapeHtml(team.name)}</strong><small>${counts.batters} batters · ${counts.pitchers} pitchers</small></button>`;
  }).join('');
}

function createTeamFromPicker(side) {
  const input = $(side === 'home' ? 'homeTeam' : 'awayTeam');
  const name = input.value.trim();
  if (!name) return showToast('Type a team name first');
  const existing = savedTeams.find(team => normalizePlayerName(team.name) === normalizePlayerName(name));
  const team = existing || {id: createTeamId(), name, updatedAt: new Date().toISOString(), lineup: blankTeamRoster()};
  if (!existing) savedTeams.unshift(team);
  input.value = team.name;
  state.lineups[side] = cleanLineupForTeam(team.lineup);
  persistTeams();
  renderLineupOptions();
  syncPlayersForHalf();
  updateLineupLabels();
  render();
  save();
  closeTeamPickers();
  showToast(`${team.name} added`);
}

function openTeamsManagerForName(name = '') {
  closeTeamPickers();
  $('teamNameInput').value = name;
  beginTeamEdit();
  renderTeamsList();
  $('teamsDialog').showModal();
}

function renderTeamPickers() {
  renderTeamPicker('home');
  renderTeamPicker('away');
}

function openTeamPicker(side) {
  renderTeamPicker(side);
  teamPickerMenu(side).hidden = false;
}

function closeTeamPickers() {
  ['home', 'away'].forEach(side => {
    const menu = teamPickerMenu(side);
    if (menu) menu.hidden = true;
  });
}

$('teamsButton').addEventListener('click', () => {
  if (!editingTeamRoster) beginTeamEdit();
  renderTeamsList();
  $('teamsDialog').showModal();
});
$('closeTeams').addEventListener('click', () => $('teamsDialog').close());
$('cancelTeams').addEventListener('click', () => $('teamsDialog').close());
$('teamsDialog').addEventListener('click', (event) => { if (event.target === $('teamsDialog')) $('teamsDialog').close(); });
$('createTeamButton').addEventListener('click', () => beginTeamEdit());
$('saveHomeTeam').addEventListener('click', () => saveLineupAsTeam('home'));
$('saveAwayTeam').addEventListener('click', () => saveLineupAsTeam('away'));
$('addTeamBatter').addEventListener('click', () => {
  readTeamEditor();
  editingTeamRoster.batters.push(blankRosterPlayer('batter'));
  renderTeamEditor();
  $('teamBatters').querySelector('.team-player-row:last-child .team-player-name')?.focus();
});
$('addTeamPitcher').addEventListener('click', () => {
  readTeamEditor();
  editingTeamRoster.pitchers.push(blankRosterPlayer('pitcher'));
  renderTeamEditor();
  $('teamPitchers').querySelector('.team-player-row:last-child .team-player-name')?.focus();
});
$('batchAddBatters').addEventListener('click', () => batchAddTeamPlayers('batter'));
$('batchAddPitchers').addEventListener('click', () => batchAddTeamPlayers('pitcher'));
$('cancelTeamEdit').addEventListener('click', cancelTeamEdit);
$('saveTeamRoster').addEventListener('click', saveTeamEditorRoster);
$('teamEditor').addEventListener('click', (event) => {
  const removeButton = event.target.closest('[data-remove-team-player]');
  if (!removeButton) return;
  readTeamEditor();
  const list = removeButton.closest('#teamBatters') ? editingTeamRoster.batters : editingTeamRoster.pitchers;
  const index = [...removeButton.closest('.team-player-list').querySelectorAll('.team-player-row')].indexOf(removeButton.closest('.team-player-row'));
  list.splice(index, 1);
  renderTeamEditor();
});
$('teamsList').addEventListener('click', (event) => {
  const row = event.target.closest('.team-row');
  if (!row) return;
  const teamId = row.dataset.teamId;
  const team = savedTeams.find(item => item.id === teamId);
  if (event.target.closest('[data-edit-team]')) {
    if (team) beginTeamEdit(team);
    return;
  }
  const loadButton = event.target.closest('[data-load-team]');
  if (loadButton) {
    loadTeamIntoSide(teamId, loadButton.dataset.loadTeam);
    return;
  }
  if (event.target.closest('[data-delete-team]')) {
    if (!team || !confirm(`Delete saved team "${team.name}"?`)) return;
    savedTeams = savedTeams.filter(item => item.id !== teamId);
    persistTeams();
    showToast('Team deleted');
  }
});
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) $('installButton').hidden = true;
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

function buildLineupEditor() {
  updateLineupLabels();
  renderLineupRosterChoices(editingTeam);
  const lineup = state.lineups[editingTeam];
  $('battingLineup').innerHTML = lineup.batters.map((player, index) => `
    <div class="lineup-row batting" data-player-id="${player.id}" data-substituted-for="${escapeHtml(player.substitutedFor || '')}" data-substituted-for-number="${escapeHtml(player.substitutedForNumber || '')}" data-substituted-for-position="${escapeHtml(player.substitutedForPosition || '')}" data-substituted-for-bats="${escapeHtml(player.substitutedForBats || '')}" data-substitution-at="${escapeHtml(player.substitutionAt || '')}">
      <span class="order-number">${index + 1}</span>
      <div class="lineup-player-cell"><input class="lineup-name" list="savedBatterPlayers" data-kind="batter" data-index="${index}" value="${escapeHtml(player.name)}" placeholder="${escapeHtml(player.substitutedFor ? `Sub for ${player.substitutedFor}` : `Player ${index + 1}`)}" aria-label="Batter ${index + 1} name">${player.substitutedFor ? `<small>Sub for ${player.substitutedForNumber ? `#${escapeHtml(player.substitutedForNumber)} ` : ''}${escapeHtml(player.substitutedFor)}${player.substitutionAt ? ` · ${escapeHtml(player.substitutionAt)}` : ''}</small>` : ''}</div>
      <input class="lineup-number" data-index="${index}" value="${escapeHtml(player.number || '')}" placeholder="#" maxlength="3" inputmode="numeric" aria-label="Batter ${index + 1} jersey number">
      <select class="lineup-position" data-index="${index}" aria-label="Batter ${index + 1} position">${positionOptions(player.position)}</select>
      <select class="lineup-bats" data-index="${index}" aria-label="Batter ${index + 1} bats"><option ${player.bats === 'R' ? 'selected' : ''}>R</option><option ${player.bats === 'L' ? 'selected' : ''}>L</option><option ${player.bats === 'S' ? 'selected' : ''}>S</option></select>
      <div class="lineup-sub-actions"><button class="sub-player" data-kind="batter" data-index="${index}" type="button" title="Substitute for ${escapeHtml(player.name || `Player ${index + 1}`)}">Sub</button>${player.substitutedFor ? `<button class="return-player" data-index="${index}" type="button" title="Return ${escapeHtml(player.substitutedFor)}">Return</button>` : ''}</div>
      <div class="lineup-move"><button class="move-player" data-kind="batter" data-index="${index}" data-direction="-1" type="button" title="Move up" aria-label="Move batter ${index + 1} up" ${index === 0 ? 'disabled' : ''}>↑</button><button class="move-player" data-kind="batter" data-index="${index}" data-direction="1" type="button" title="Move down" aria-label="Move batter ${index + 1} down" ${index === lineup.batters.length - 1 ? 'disabled' : ''}>↓</button></div>
      <button class="remove-player" data-kind="batter" data-index="${index}" type="button" title="Remove ${escapeHtml(player.name || `Player ${index + 1}`)}" aria-label="Remove batter ${index + 1}">×</button>
    </div>`).join('');
  $('pitchingStaff').innerHTML = lineup.pitchers.map((player, index) => `
    <div class="lineup-row pitching" data-player-id="${player.id}">
      <span class="order-number">${index + 1}</span>
      <input class="lineup-name" list="savedPitcherPlayers" data-kind="pitcher" data-index="${index}" value="${escapeHtml(player.name)}" placeholder="Pitcher ${index + 1}" aria-label="Pitcher ${index + 1} name">
      <input class="lineup-number" data-index="${index}" value="${escapeHtml(player.number || '')}" placeholder="#" maxlength="3" inputmode="numeric" aria-label="Pitcher ${index + 1} jersey number">
      <select class="lineup-throws" data-index="${index}" aria-label="Pitcher ${index + 1} throws"><option ${player.throws === 'R' ? 'selected' : ''}>R</option><option ${player.throws === 'L' ? 'selected' : ''}>L</option></select>
      <button class="remove-player" data-kind="pitcher" data-index="${index}" type="button" title="Remove ${escapeHtml(player.name || `Pitcher ${index + 1}`)}" aria-label="Remove pitcher ${index + 1}">×</button>
    </div>`).join('');
  updateLineupCount();
}

function positionOptions(selected = '') {
  return ['', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'UTIL']
    .map(position => `<option value="${position}" ${position === selected ? 'selected' : ''}>${position || 'Pos'}</option>`).join('');
}

function readLineupEditor() {
  state.lineups[editingTeam].batters = [...$('battingLineup').querySelectorAll('.lineup-row')].map((row) => ({
    id: row.dataset.playerId, name: row.querySelector('.lineup-name').value.trim(), number: row.querySelector('.lineup-number').value.trim(), position: row.querySelector('.lineup-position').value.trim().toUpperCase(), bats: row.querySelector('.lineup-bats').value,
    substitutedFor: row.dataset.substitutedFor || '', substitutedForNumber: row.dataset.substitutedForNumber || '', substitutedForPosition: row.dataset.substitutedForPosition || '', substitutedForBats: row.dataset.substitutedForBats || '', substitutionAt: row.dataset.substitutionAt || ''
  }));
  state.lineups[editingTeam].pitchers = [...$('pitchingStaff').querySelectorAll('.lineup-row')].map((row) => ({
    id: row.dataset.playerId, name: row.querySelector('.lineup-name').value.trim(), number: row.querySelector('.lineup-number').value.trim(), throws: row.querySelector('.lineup-throws').value
  }));
}

function renderLineupOptions() {
  const selectedBatter = $('batter').value;
  const selectedPitcher = $('pitcher').value;
  const battingTeam = $('half').value === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const batters = state.lineups[battingTeam].batters.filter(p => p.name);
  const pitchers = state.lineups[fieldingTeam].pitchers.filter(p => p.name);
  $('batter').innerHTML = `<option value="">${capitalize(battingTeam)} batter</option>${batters.map((p, i) => `<option value="${escapeHtml(p.name)}">${i + 1}. ${p.number ? `#${escapeHtml(p.number)} ` : ''}${escapeHtml(p.name)}${p.position ? ` · ${escapeHtml(p.position)}` : ''}</option>`).join('')}`;
  $('pitcher').innerHTML = `<option value="">${capitalize(fieldingTeam)} pitcher</option>${pitchers.map(p => `<option value="${escapeHtml(p.name)}">${p.number ? `#${escapeHtml(p.number)} ` : ''}${escapeHtml(p.name)} · ${p.throws}HP</option>`).join('')}`;
  if ([...$('batter').options].some(option => option.value === selectedBatter)) $('batter').value = selectedBatter;
  if ([...$('pitcher').options].some(option => option.value === selectedPitcher)) $('pitcher').value = selectedPitcher;
}

function capitalize(value) { return value[0].toUpperCase() + value.slice(1); }
function teamDisplayName(team) {
  const value = $(team === 'home' ? 'homeTeam' : 'awayTeam').value.trim();
  return value || `${capitalize(team)} Team`;
}

function updateLineupLabels() {
  $('teamTabs').querySelectorAll('.team-tab').forEach((button) => {
    const label = button.querySelector('span').outerHTML;
    button.innerHTML = `${label} ${escapeHtml(teamDisplayName(button.dataset.team))}`;
  });
  const teamName = teamDisplayName(editingTeam);
  $('lineupDialogTitle').textContent = `${teamName} Lineup`;
  $('battingLineupTitle').textContent = `${teamName} batting order`;
  $('pitchingStaffTitle').textContent = `${teamName} pitching staff`;
}

function updateLineupCount() {
  const names = $('lineupDialog').querySelectorAll('.lineup-name');
  const count = [...names].filter(input => input.value.trim()).length;
  const teamName = teamDisplayName(editingTeam);
  $('lineupCount').textContent = count ? `${teamName} · ${count} player${count === 1 ? '' : 's'} ready` : `${teamName} · No players added`;
}

$('lineupButton').addEventListener('click', () => {
  lineupSnapshot = JSON.parse(JSON.stringify(state.lineups));
  lineupSituationSnapshot = currentGameSituation();
  buildLineupEditor(); $('lineupDialog').showModal();
});
$('teamTabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.team-tab');
  if (!tab || tab.dataset.team === editingTeam) return;
  readLineupEditor();
  if (!validateNoDuplicateLineupPlayers(editingTeam)) return;
  editingTeam = tab.dataset.team;
  $('teamTabs').querySelectorAll('.team-tab').forEach(button => {
    const active = button.dataset.team === editingTeam;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  buildLineupEditor();
});
function cancelLineupChanges() {
  if (lineupSnapshot) state.lineups = JSON.parse(JSON.stringify(lineupSnapshot));
  if (lineupSituationSnapshot) restoreGameSituation(lineupSituationSnapshot);
  lineupSnapshot = null;
  lineupSituationSnapshot = null;
  $('lineupDialog').close();
}
$('closeLineup').addEventListener('click', cancelLineupChanges);
$('cancelLineup').addEventListener('click', cancelLineupChanges);
$('lineupDialog').addEventListener('input', updateLineupCount);
$('lineupDialog').addEventListener('change', (event) => {
  const input = event.target.closest('.lineup-name');
  if (input) fillLineupPlayerFromSaved(input);
});
$('lineupDialog').addEventListener('click', (event) => { if (event.target === $('lineupDialog')) cancelLineupChanges(); });
$('jumpBatters').addEventListener('click', () => $('battingLineupTitle').scrollIntoView({behavior: 'smooth', block: 'start'}));
$('jumpPitchers').addEventListener('click', () => $('pitchingStaffTitle').scrollIntoView({behavior: 'smooth', block: 'start'}));
$('quickBatters').addEventListener('click', () => {
  $('battingLineup').querySelectorAll('.lineup-name').forEach((input, index) => { if (!input.value.trim()) input.value = `Player ${index + 1}`; });
  updateLineupCount();
});
$('quickPitchers').addEventListener('click', () => {
  $('pitchingStaff').querySelectorAll('.lineup-name').forEach((input, index) => { if (!input.value.trim()) input.value = `Pitcher ${index + 1}`; });
  updateLineupCount();
});
$('addBatterRow').addEventListener('click', () => {
  readLineupEditor();
  state.lineups[editingTeam].batters.push({id: createPlayerId('batter'), name: '', number: '', position: '', bats: 'R'});
  buildLineupEditor();
  $('battingLineup').querySelector('.lineup-row:last-child .lineup-name').focus();
});
$('addPitcherRow').addEventListener('click', () => {
  readLineupEditor();
  state.lineups[editingTeam].pitchers.push({id: createPlayerId('pitcher'), name: '', number: '', throws: 'R'});
  buildLineupEditor();
  $('pitchingStaff').querySelector('.lineup-row:last-child .lineup-name').focus();
});
$('lineupDialog').addEventListener('click', (event) => {
  const returnButton = event.target.closest('.return-player');
  if (returnButton) {
    readLineupEditor();
    const collection = state.lineups[editingTeam].batters;
    const index = Number(returnButton.dataset.index);
    const player = collection[index] || {};
    const returningName = player.substitutedFor;
    if (!returningName) return;
    const currentName = player.name || `Player ${index + 1}`;
    collection[index] = {
      id: createPlayerId('batter'),
      name: returningName,
      number: player.substitutedForNumber || '',
      position: player.substitutedForPosition || player.position || '',
      bats: player.substitutedForBats || player.bats || 'R',
      substitutedFor: currentName,
      substitutedForNumber: player.number || '',
      substitutedForPosition: player.position || '',
      substitutedForBats: player.bats || '',
      substitutionAt: `${$('half').value} ${$('inning').value}`
    };
    buildLineupEditor();
    const row = $('battingLineup').querySelectorAll('.lineup-row')[index];
    row?.scrollIntoView({block: 'nearest'});
    row?.querySelector('.lineup-name')?.focus();
    showToast(`${returningName} returned for ${currentName}`);
    return;
  }
  const subButton = event.target.closest('.sub-player');
  if (subButton) {
    readLineupEditor();
    const collection = state.lineups[editingTeam].batters;
    const index = Number(subButton.dataset.index);
    const oldPlayer = collection[index] || {};
    collection[index] = {
      id: createPlayerId('batter'),
      name: '',
      number: '',
      position: oldPlayer.position || '',
      bats: oldPlayer.bats || 'R',
      substitutedFor: oldPlayer.name || '',
      substitutedForNumber: oldPlayer.number || '',
      substitutedForPosition: oldPlayer.position || '',
      substitutedForBats: oldPlayer.bats || '',
      substitutionAt: `${$('half').value} ${$('inning').value}`
    };
    buildLineupEditor();
    const row = $('battingLineup').querySelectorAll('.lineup-row')[index];
    row?.scrollIntoView({block: 'nearest'});
    row?.querySelector('.lineup-name')?.focus();
    showToast(`Type the substitute for ${oldPlayer.name || `Player ${index + 1}`}`);
    return;
  }
  const moveButton = event.target.closest('.move-player');
  if (moveButton) {
    readLineupEditor();
    const collection = moveButton.dataset.kind === 'batter' ? state.lineups[editingTeam].batters : state.lineups[editingTeam].pitchers;
    const index = Number(moveButton.dataset.index);
    const targetIndex = index + Number(moveButton.dataset.direction);
    if (targetIndex < 0 || targetIndex >= collection.length) return;
    [collection[index], collection[targetIndex]] = [collection[targetIndex], collection[index]];
    buildLineupEditor();
    const movedList = moveButton.dataset.kind === 'batter' ? $('battingLineup') : $('pitchingStaff');
    const movedRow = movedList.querySelectorAll('.lineup-row')[targetIndex];
    movedRow?.scrollIntoView({block: 'nearest'});
    movedRow?.querySelector('.lineup-name')?.focus();
    return;
  }
  const button = event.target.closest('.remove-player');
  if (!button) return;
  readLineupEditor();
  const collection = button.dataset.kind === 'batter' ? state.lineups[editingTeam].batters : state.lineups[editingTeam].pitchers;
  collection.splice(Number(button.dataset.index), 1);
  buildLineupEditor();
});

function pitchBelongsToTeam(pitch, kind, team) {
  const battingTeam = pitch.half === 'Top' ? 'away' : 'home';
  const playerTeam = kind === 'batter' ? battingTeam : (battingTeam === 'away' ? 'home' : 'away');
  return playerTeam === team;
}

function normalizePlayerName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function playerMatchesPitch(player, pitch, kind) {
  const pitchId = pitch[`${kind}Id`];
  const pitchName = pitch[kind];
  const pitchNumber = pitch[`${kind}Number`];
  return (pitchId && player.key === pitchId) ||
    (pitchId && player.aliases?.includes(pitchId)) ||
    (pitchName && normalizePlayerName(player.name) === normalizePlayerName(pitchName)) ||
    (pitchName && player.aliases?.includes(normalizePlayerName(pitchName))) ||
    (pitchNumber && player.number && String(player.number) === String(pitchNumber));
}

function scorecardAliases(player, extra = []) {
  return [
    player.id,
    normalizePlayerName(player.name),
    player.number ? `number:${String(player.number)}` : '',
    ...extra
  ].filter(Boolean);
}

function findScorecardPlayer(players, pitch) {
  const direct = players.find(player => playerMatchesPitch(player, pitch, 'batter'));
  if (direct) return direct;
  const pitchNumber = pitch.batterNumber ? `number:${String(pitch.batterNumber)}` : '';
  return players.find(player => (
    (pitch.batterId && player.aliases?.includes(pitch.batterId)) ||
    (pitch.batter && player.aliases?.includes(normalizePlayerName(pitch.batter))) ||
    (pitchNumber && player.aliases?.includes(pitchNumber))
  ));
}

function propagateLineupChanges(previousLineups) {
  if (!previousLineups) return;
  ['home', 'away'].forEach((team) => {
    ['batters', 'pitchers'].forEach((collectionName) => {
      const kind = collectionName === 'batters' ? 'batter' : 'pitcher';
      const before = previousLineups[team][collectionName] || [];
      const after = state.lineups[team][collectionName] || [];
      before.forEach((oldPlayer) => {
        const newPlayer = after.find(player => player.id === oldPlayer.id);
        if (!oldPlayer?.name || !newPlayer?.name) return;
        state.pitches.forEach((pitch) => {
          const linkedById = pitch[`${kind}Id`] && pitch[`${kind}Id`] === oldPlayer.id;
          const legacyMatch = !pitch[`${kind}Id`] && pitch[kind] === oldPlayer.name && pitchBelongsToTeam(pitch, kind, team);
          if (!linkedById && !legacyMatch) return;
          pitch[`${kind}Id`] = newPlayer.id;
          pitch[kind] = newPlayer.name;
          pitch[`${kind}Number`] = newPlayer.number || '';
          if (kind === 'batter') pitch.bats = newPlayer.bats;
        });
        if (kind === 'pitcher' && state.selectedPitchers[team] === oldPlayer.name) state.selectedPitchers[team] = newPlayer.name;
      });
    });
  });
}

$('saveLineup').addEventListener('click', () => {
  const currentSituation = lineupSituationSnapshot || currentGameSituation();
  readLineupEditor();
  if (!['home', 'away'].every(validateNoDuplicateLineupPlayers)) return;
  ['home', 'away'].forEach(syncLineupToSavedRoster);
  persistTeams();
  propagateLineupChanges(lineupSnapshot);
  lineupSnapshot = null;
  lineupSituationSnapshot = null;
  renderLineupOptions(); save(); $('lineupDialog').close();
  syncPlayersForHalf();
  restoreGameSituation(currentSituation);
  render(); save(); showToast('Lineups and pitch history updated');
});
$('exportLineupsPdf').addEventListener('click', () => {
  readLineupEditor();
  const bytes = createLineupsPdf({
    homeName: $('homeTeam').value.trim() || 'Home Team',
    awayName: $('awayTeam').value.trim() || 'Away Team',
    date: $('gameDate').value,
    home: state.lineups.home,
    away: state.lineups.away
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  link.download = `${gameFileBase()}_lineups.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  save(); showToast('Lineups PDF exported');
});

$('exportStatsPdf').addEventListener('click', () => {
  if (!state.pitches.length) return showToast('Record a pitch before exporting stats');
  const bytes = createStatsPdf(statsPdfData());
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  link.download = `${gameFileBase()}_live-stats.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast('Live stats PDF exported');
});

function relinkPitchesToCurrentLineups() {
  state.pitches.forEach((pitch) => {
    const battingTeam = pitchBattingTeam(pitch);
    const fieldingTeam = pitchFieldingTeam(pitch);
    const batter = state.lineups[battingTeam].batters.find(player => (
      (pitch.batterId && player.id === pitch.batterId) ||
      (pitch.batter && normalizePlayerName(player.name) === normalizePlayerName(pitch.batter)) ||
      (pitch.batterNumber && player.number && String(player.number) === String(pitch.batterNumber))
    )) || (pitch.batterOrder ? state.lineups[battingTeam].batters[Number(pitch.batterOrder) - 1] : null);
    const pitcher = state.lineups[fieldingTeam].pitchers.find(player => (
      (pitch.pitcherId && player.id === pitch.pitcherId) ||
      (pitch.pitcher && normalizePlayerName(player.name) === normalizePlayerName(pitch.pitcher)) ||
      (pitch.pitcherNumber && player.number && String(player.number) === String(pitch.pitcherNumber))
    )) || (pitch.pitcherOrder ? state.lineups[fieldingTeam].pitchers[Number(pitch.pitcherOrder) - 1] : null);
    if (batter) {
      pitch.batterId = batter.id;
      pitch.batter = batter.name || pitch.batter;
      pitch.batterNumber = batter.number || pitch.batterNumber || '';
      pitch.bats = batter.bats || pitch.bats;
    }
    if (pitcher) {
      pitch.pitcherId = pitcher.id;
      pitch.pitcher = pitcher.name || pitch.pitcher;
      pitch.pitcherNumber = pitcher.number || pitch.pitcherNumber || '';
    }
  });
}

$('switchTeams').addEventListener('click', () => {
  if (!confirm('Switch Home and Away for this game? This will swap team names, lineups, and pitcher selections.')) return;
  const oldHomeName = $('homeTeam').value;
  $('homeTeam').value = $('awayTeam').value;
  $('awayTeam').value = oldHomeName;
  [state.lineups.home, state.lineups.away] = [state.lineups.away, state.lineups.home];
  [state.battingIndexes.home, state.battingIndexes.away] = [state.battingIndexes.away, state.battingIndexes.home];
  [state.selectedPitchers.home, state.selectedPitchers.away] = [state.selectedPitchers.away, state.selectedPitchers.home];
  editingTeam = editingTeam === 'home' ? 'away' : 'home';
  $('teamTabs').querySelectorAll('.team-tab').forEach((button) => {
    const active = button.dataset.team === editingTeam;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  relinkPitchesToCurrentLineups();
  renderLineupOptions();
  syncPlayersForHalf();
  updateLineupLabels();
  render();
  save();
  showToast('Home and Away switched');
});

function setBatter(player) { $('batter').value = player.name; $('bats').value = player.bats; }
$('batter').addEventListener('change', () => {
  const team = $('half').value === 'Top' ? 'away' : 'home';
  const order = state.lineups[team].batters.filter(p => p.name);
  const index = order.findIndex(p => p.name === $('batter').value);
  if (index >= 0) { state.battingIndexes[team] = index; setBatter(order[index]); }
});
function moveToNextBatter(showMessage = true, team = ($('half').value === 'Top' ? 'away' : 'home')) {
  const order = state.lineups[team].batters.filter(p => p.name);
  if (!order.length) { if (showMessage) showToast('Add your batting lineup first'); return; }
  const isActiveTeam = team === ($('half').value === 'Top' ? 'away' : 'home');
  const current = isActiveTeam ? order.findIndex(p => p.name === $('batter').value) : state.battingIndexes[team];
  state.battingIndexes[team] = (current + 1) % order.length;
  if (isActiveTeam) setBatter(order[state.battingIndexes[team]]);
  save();
  if (showMessage && isActiveTeam) showToast(`Now batting: ${$('batter').value}`);
}
$('nextBatter').addEventListener('click', () => moveToNextBatter(true));
$('pitcher').addEventListener('change', () => {
  const fieldingTeam = $('half').value === 'Top' ? 'home' : 'away';
  state.selectedPitchers[fieldingTeam] = $('pitcher').value;
});

function syncPlayersForHalf() {
  renderLineupOptions();
  const battingTeam = $('half').value === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const order = state.lineups[battingTeam].batters.filter(p => p.name);
  const pitchers = state.lineups[fieldingTeam].pitchers.filter(p => p.name);
  if (order.length) {
    state.battingIndexes[battingTeam] %= order.length;
    setBatter(order[state.battingIndexes[battingTeam]]);
  }
  const savedPitcher = state.selectedPitchers[fieldingTeam];
  const pitcher = pitchers.find(p => p.name === savedPitcher) || pitchers[0];
  if (pitcher) { $('pitcher').value = pitcher.name; state.selectedPitchers[fieldingTeam] = pitcher.name; }
}
$('half').addEventListener('change', () => { syncPlayersForHalf(); save(); });

let editingPlayerKind = null;
let editingPlayer = null;
function openPlayerEditor(kind) {
  const select = $(kind);
  if (!select.value) { showToast(`Choose a ${kind} first`); return; }
  editingPlayerKind = kind;
  const battingTeam = $('half').value === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const team = kind === 'batter' ? battingTeam : fieldingTeam;
  const collection = kind === 'batter' ? state.lineups[team].batters : state.lineups[team].pitchers;
  editingPlayer = collection.find(p => p.name === select.value) || null;
  $('renameTitle').textContent = `Rename ${kind}`;
  $('renameInput').value = select.value;
  $('renameNumber').value = editingPlayer?.number || '';
  $('renameDialog').showModal();
  $('renameInput').focus();
  $('renameInput').select();
}
$('editBatter').addEventListener('click', () => openPlayerEditor('batter'));
$('editPitcher').addEventListener('click', () => openPlayerEditor('pitcher'));
$('closeRename').addEventListener('click', () => $('renameDialog').close());
$('cancelRename').addEventListener('click', () => $('renameDialog').close());
$('renameDialog').addEventListener('click', (event) => { if (event.target === $('renameDialog')) $('renameDialog').close(); });
$('renameInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); $('saveRename').click(); } });
$('renameNumber').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); $('saveRename').click(); } });
$('saveRename').addEventListener('click', () => {
  const newName = $('renameInput').value.trim();
  const newNumber = $('renameNumber').value.trim();
  if (!newName || !editingPlayerKind) return;
  const oldName = $(editingPlayerKind).value;
  const battingTeam = $('half').value === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const team = editingPlayerKind === 'batter' ? battingTeam : fieldingTeam;
  const collection = editingPlayerKind === 'batter' ? state.lineups[team].batters : state.lineups[team].pitchers;
  const player = editingPlayer || collection.find(p => p.name === oldName);
  if (player) { player.name = newName; player.number = newNumber; }
  if (editingPlayerKind === 'pitcher' && state.selectedPitchers[team] === oldName) state.selectedPitchers[team] = newName;
  state.pitches.forEach(pitch => {
    const linkedById = player?.id && pitch[`${editingPlayerKind}Id`] === player.id;
    const legacyMatch = !pitch[`${editingPlayerKind}Id`] && pitch[editingPlayerKind] === oldName && pitchBelongsToTeam(pitch, editingPlayerKind, team);
    if (linkedById || legacyMatch) {
      pitch[`${editingPlayerKind}Id`] = player?.id || '';
      pitch[editingPlayerKind] = newName;
      pitch[`${editingPlayerKind}Number`] = newNumber;
    }
  });
  renderLineupOptions();
  $(editingPlayerKind).value = newName;
  editingPlayer = null;
  render(); save(); $('renameDialog').close(); showToast(`${oldName} updated`);
});

function choose(container, selector, callback) {
  $(container).addEventListener('click', (event) => {
    const button = event.target.closest(selector);
    if (!button) return;
    $(container).querySelectorAll(selector).forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    callback(button);
  });
}

choose('pitchTypes', 'button', (button) => {
  state.pitchType = button.dataset.value;
  state.pitchGroup = button.dataset.group;
  save();
});
choose('basicResults', 'button', (button) => {
  state.result = button.dataset.value;
  state.contactType = null; state.outLocation = ''; state.errorLocation = '';
  $('contactTypes').querySelectorAll('button').forEach(item => item.classList.remove('selected'));
  $('inPlayResults').querySelectorAll('button').forEach(item => item.classList.remove('selected'));
  $('outPositions').querySelectorAll('button').forEach(item => item.classList.remove('selected'));
  $('errorPositions').querySelectorAll('button').forEach(item => item.classList.remove('selected'));
  $('outLocationWrap').hidden = true;
  $('errorLocationWrap').hidden = true;
  updateRecordButton();
});
choose('contactTypes', 'button', (button) => {
  state.contactType = button.dataset.value;
  if (!isInPlayResult(state.result)) state.result = null;
  $('basicResults').querySelectorAll('button').forEach(item => item.classList.remove('selected'));
  updateRecordButton();
});
choose('inPlayResults', 'button', (button) => {
  state.result = button.dataset.value;
  $('basicResults').querySelectorAll('button').forEach(item => item.classList.remove('selected'));
  const isOut = ['In play - out', 'Double play'].includes(state.result);
  const isError = state.result === 'Error';
  $('outLocationWrap').hidden = !isOut;
  $('errorLocationWrap').hidden = !isError;
  if (!isOut) { state.outLocation = ''; $('outPositions').querySelectorAll('button').forEach(item => item.classList.remove('selected')); }
  if (!isError) { state.errorLocation = ''; $('errorPositions').querySelectorAll('button').forEach(item => item.classList.remove('selected')); }
  updateRecordButton();
});
choose('outPositions', 'button', (button) => { state.outLocation = button.dataset.value; updateRecordButton(); });
choose('errorPositions', 'button', (button) => { state.errorLocation = button.dataset.value; updateRecordButton(); });

$('outButtons').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  state.outs = Number(button.dataset.outs);
  updateOutButtons();
  save();
});

function updateOutButtons() {
  $('outButtons').querySelectorAll('button').forEach((button) => button.classList.toggle('active', Number(button.dataset.outs) === state.outs));
}

function clearPitchEntryForm() {
  state.location = null;
  state.pitchType = 'Four-seam';
  state.pitchGroup = 'fastball';
  state.result = null;
  state.contactType = null;
  state.outLocation = '';
  state.errorLocation = '';
  $('velocity').value = '';
  $('note').value = '';
  $('crosshair').classList.remove('visible');
  $('zoneHelp').textContent = 'Location is optional — tap the zone if you want to chart it.';
  $('pitchTypes').querySelectorAll('button').forEach((button) => {
    button.classList.toggle('selected', button.dataset.value === 'Four-seam');
  });
  ['basicResults', 'contactTypes', 'inPlayResults'].forEach((id) => {
    $(id).querySelectorAll('button').forEach((button) => button.classList.remove('selected'));
  });
  $('outPositions').querySelectorAll('button').forEach((button) => button.classList.remove('selected'));
  $('errorPositions').querySelectorAll('button').forEach((button) => button.classList.remove('selected'));
  $('outLocationWrap').hidden = true;
  $('errorLocationWrap').hidden = true;
  updateRecordButton();
}

function hasLineupPlayers(team) {
  const lineup = state.lineups[team];
  return lineup.batters.some(player => player.name || player.number || player.position) ||
    lineup.pitchers.some(player => player.name || player.number);
}

function hasGameContent() {
  return state.pitches.length > 0 ||
    $('homeTeam').value.trim() ||
    $('awayTeam').value.trim() ||
    hasLineupPlayers('home') ||
    hasLineupPlayers('away') ||
    state.balls > 0 ||
    state.strikes > 0 ||
    state.outs > 0 ||
    $('inning').value !== '1' ||
    $('half').value !== 'Top';
}

function updateResetButtonState() {
  $('resetButton').disabled = !hasGameContent();
}

function setPanelVisibility(panel, hidden) {
  state.uiHidden[panel] = hidden;
  const body = panel === 'zone' ? $('zoneBody') : panel === 'boxScore' ? $('boxScoreBody') : $('historyBody');
  const button = panel === 'zone' ? $('toggleZone') : panel === 'boxScore' ? $('toggleBoxScore') : $('toggleHistory');
  body.hidden = hidden;
  const label = panel === 'zone' ? 'zone' : panel === 'boxScore' ? 'stats' : 'history';
  button.textContent = hidden ? `Show ${label}` : `Hide ${label}`;
  button.setAttribute('aria-expanded', String(!hidden));
  save();
}

$('toggleZone').addEventListener('click', () => setPanelVisibility('zone', !state.uiHidden.zone));
$('toggleHistory').addEventListener('click', () => setPanelVisibility('history', !state.uiHidden.history));
$('toggleBoxScore').addEventListener('click', () => setPanelVisibility('boxScore', !state.uiHidden.boxScore));

$('ballCount').closest('.count-editor').addEventListener('click', (event) => {
  const button = event.target.closest('[data-count-kind]');
  if (!button) return;
  const kind = button.dataset.countKind;
  const max = kind === 'balls' ? 3 : 2;
  state[kind] = Math.max(0, Math.min(max, state[kind] + Number(button.dataset.countStep)));
  render();
  save();
});

$('zoneStage').addEventListener('click', (event) => {
  const rect = $('zoneStage').getBoundingClientRect();
  state.location = {
    x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
  };
  showCrosshair();
  updateRecordButton();
});

function showCrosshair() {
  if (!state.location) return;
  const crosshair = $('crosshair');
  crosshair.style.left = `${state.location.x}%`;
  crosshair.style.top = `${state.location.y}%`;
  crosshair.classList.add('visible');
  $('zoneHelp').textContent = `Location selected: ${locationName(state.location)}`;
}

function locationName(location) {
  if (!location) return 'Not recorded';
  const horizontal = location.x < 25 ? 'far left' : location.x > 75 ? 'far right' : location.x < 41.7 ? 'left' : location.x > 58.3 ? 'right' : 'middle';
  const vertical = location.y < 14 ? 'high' : location.y > 78 ? 'low' : location.y < 35.3 ? 'upper' : location.y > 56.7 ? 'lower' : 'middle';
  return `${vertical} ${horizontal}`;
}

function isInPlayResult(result) { return ['In play', 'Single', 'Double', 'Triple', 'Home run', 'In play - out', 'Double play', 'Error'].includes(result); }
function updateRecordButton() {
  $('recordButton').disabled = false;
}

function resultWouldRecordOut(result) {
  if (['Strikeout', 'In play - out', 'Double play'].includes(result)) return true;
  return ['Called strike', 'Swinging strike'].includes(result) && state.strikes + 1 >= 3;
}

function resultWouldChangeInning(result) {
  const outsToAdd = result === 'Double play' ? 2 : (resultWouldRecordOut(result) ? 1 : 0);
  return outsToAdd > 0 && state.outs + outsToAdd >= 3;
}

function confirmBatterAdvance(outcome, battingTeam) {
  if (!outcome.plateAppearanceEnded) return true;
  const order = state.lineups[battingTeam].batters.filter(p => p.name);
  if (!order.length) return true;
  const currentIndex = order.findIndex(p => p.name === $('batter').value);
  const nextBatter = order[(currentIndex >= 0 ? currentIndex + 1 : state.battingIndexes[battingTeam] + 1) % order.length];
  const currentName = $('batter').value || 'current batter';
  const nextName = nextBatter?.name || 'next batter';
  return confirm(`This plate appearance is over (${outcome.label || 'result recorded'}). Move from ${currentName} to ${nextName}?`);
}

let editingPitchIndex = -1;
let editingPitchLocation = null;
function pitchGroupForType(type) {
  if (['Four-seam', 'Two-seam'].includes(type)) return 'fastball';
  if (['Cutter', 'Slider', 'Curveball'].includes(type)) return 'breaking';
  if (['Changeup', 'Splitter'].includes(type)) return 'offspeed';
  return 'other';
}

function updateEditPitchFields() {
  const result = $('editResult').value;
  const inPlay = isInPlayResult(result);
  $('editContactWrap').hidden = !inPlay;
  $('editOutWrap').hidden = !['In play - out', 'Double play'].includes(result);
  $('editErrorWrap').hidden = result !== 'Error';
  if (!inPlay) $('editContact').value = '';
  if (!['In play - out', 'Double play'].includes(result)) $('editOutPosition').value = '';
  if (result !== 'Error') $('editErrorPosition').value = '';
}

function playerLabel(player, fallback) {
  const number = player.number ? `#${player.number} ` : '';
  const details = [player.position, player.throws ? `${player.throws}HP` : ''].filter(Boolean).join(' · ');
  return `${number}${player.name || fallback}${details ? ` · ${details}` : ''}`;
}

function setPlayerSelectOptions(selectId, players, currentName, currentId, fallbackLabel) {
  const select = $(selectId);
  const activePlayers = players.filter(player => player.name);
  const hasCurrent = activePlayers.some(player => (currentId && player.id === currentId) || player.name === currentName);
  select.innerHTML = `<option value="">—</option>${activePlayers.map(player => `<option value="${escapeHtml(player.id)}">${escapeHtml(playerLabel(player, fallbackLabel))}</option>`).join('')}`;
  if (currentName && currentName !== '—' && !hasCurrent) {
    select.add(new Option(`${currentName} (not in lineup)`, `name:${currentName}`));
  }
  const selected = activePlayers.find(player => (currentId && player.id === currentId) || player.name === currentName);
  select.value = selected?.id || (currentName && currentName !== '—' ? `name:${currentName}` : '');
}

function populateEditPlayerSelects(pitch) {
  const battingTeam = pitch.half === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  setPlayerSelectOptions('editPitcherName', state.lineups[fieldingTeam].pitchers, pitch.pitcher, pitch.pitcherId, 'Pitcher');
  setPlayerSelectOptions('editBatterName', state.lineups[battingTeam].batters, pitch.batter, pitch.batterId, 'Player');
}

function selectedLineupPlayer(selectId, collection) {
  const value = $(selectId).value;
  if (!value) return null;
  return collection.find(player => player.id === value) || null;
}

function openPitchEditor(number) {
  editingPitchIndex = state.pitches.findIndex(pitch => pitch.number === number);
  if (editingPitchIndex < 0) return;
  const pitch = state.pitches[editingPitchIndex];
  editingPitchLocation = pitch.location ? {...pitch.location} : null;
  $('editPitchNumber').textContent = `#${pitch.number}`;
  populateEditPlayerSelects(pitch);
  $('editPitchType').value = pitch.type;
  $('editVelocity').value = pitch.velocity || '';
  const editableResult = pitch.result === 'In play - hit' ? 'Single' : pitch.result;
  $('editResult').value = [...$('editResult').options].some(option => option.value === editableResult) ? editableResult : 'Not recorded';
  $('editContact').value = pitch.contactType || '';
  $('editOutPosition').value = pitch.outLocation || '';
  $('editErrorPosition').value = pitch.errorLocation || '';
  $('editNote').value = pitch.note || '';
  $('editZoneMarker').hidden = !editingPitchLocation;
  if (editingPitchLocation) {
    $('editZoneMarker').style.left = `${editingPitchLocation.x}%`;
    $('editZoneMarker').style.top = `${editingPitchLocation.y}%`;
  }
  updateEditPitchFields();
  $('editPitchDialog').showModal();
}

$('editZone').addEventListener('click', (event) => {
  const rect = $('editZone').getBoundingClientRect();
  editingPitchLocation = {
    x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
  };
  $('editZoneMarker').hidden = false;
  $('editZoneMarker').style.left = `${editingPitchLocation.x}%`;
  $('editZoneMarker').style.top = `${editingPitchLocation.y}%`;
});
$('editResult').addEventListener('change', updateEditPitchFields);
$('closeEditPitch').addEventListener('click', () => $('editPitchDialog').close());
$('cancelEditPitch').addEventListener('click', () => $('editPitchDialog').close());
$('editPitchDialog').addEventListener('click', (event) => { if (event.target === $('editPitchDialog')) $('editPitchDialog').close(); });

function replayGameState() {
  if (!state.pitches.length) return;
  const first = state.pitches[0];
  [state.balls, state.strikes] = first.count.split('-').map(Number);
  state.outs = Number(first.outs);
  $('inning').value = String(first.inning);
  $('half').value = first.half;
  state.pitches.forEach((pitch) => {
    pitch.count = `${state.balls}-${state.strikes}`;
    pitch.outs = state.outs;
    pitch.inning = $('inning').value;
    pitch.half = $('half').value;
    advanceGame(pitch.result);
  });
  updateOutButtons();
  syncPlayersForHalf();
}

function csvContextSnapshot() {
  return state.pitches.map((pitch) => ({
    number: pitch.number,
    time: pitch.time || '',
    recordedAt: pitch.recordedAt || '',
    inning: pitch.inning,
    half: pitch.half,
    outs: pitch.outs,
    count: pitch.count
  }));
}

function restoreCsvContext(snapshot) {
  snapshot.forEach((saved, index) => {
    const pitch = state.pitches[index];
    if (!pitch || pitch.number !== saved.number) return;
    pitch.time = saved.time;
    pitch.recordedAt = saved.recordedAt;
    pitch.inning = saved.inning;
    pitch.half = saved.half;
    pitch.outs = saved.outs;
    pitch.count = saved.count;
  });
}

$('saveEditPitch').addEventListener('click', () => {
  if (editingPitchIndex < 0) return;
  const currentSituation = currentGameSituation();
  const csvContext = csvContextSnapshot();
  const result = $('editResult').value;
  const pitch = state.pitches[editingPitchIndex];
  const scoredResult = scoredResultForCount(result, pitch.count);
  const oldResult = pitch.result;
  const oldOutcome = pitchOutcome(pitch);
  const editedOutcome = pitchOutcome({...pitch, result: scoredResult});
  const isLastPitch = editingPitchIndex === state.pitches.length - 1;
  const situationBeforeEdit = situationBeforePitch(pitch);
  const resultChanged = oldResult !== scoredResult;
  const changesGameSituation = resultChanged && (
    isLastPitch ||
    oldOutcome.terminal !== editedOutcome.terminal ||
    outcomeOuts(oldOutcome) !== outcomeOuts(editedOutcome) ||
    resultAffectsGameFlow(oldResult) ||
    resultAffectsGameFlow(scoredResult)
  );
  if (changesGameSituation) {
    const label = outcomeLabel(editedOutcome, scoredResult);
    const inningWillChange = outcomeOuts(editedOutcome) > 0 && situationBeforeEdit.outs + outcomeOuts(editedOutcome) >= 3;
    if (isLastPitch) {
      const message = `This edit changes the last pitch to ${label}. The app will update the live count, outs, batter, and inning if needed.${inningWillChange ? ' It may also move to the next half inning.' : ''} Continue?`;
      if (!confirm(message)) return;
    } else if (!confirm(`This is an older pitch. Stats and CSV will update to ${label}, but the current live batter/outs will not be moved because later pitches already happened. Continue?`)) {
      return;
    }
  }
  const battingTeam = pitch.half === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const selectedPitcher = selectedLineupPlayer('editPitcherName', state.lineups[fieldingTeam].pitchers);
  const selectedBatter = selectedLineupPlayer('editBatterName', state.lineups[battingTeam].batters);
  const customPitcher = $('editPitcherName').value.startsWith('name:') ? $('editPitcherName').value.slice(5) : '';
  const customBatter = $('editBatterName').value.startsWith('name:') ? $('editBatterName').value.slice(5) : '';
  pitch.pitcher = selectedPitcher?.name || customPitcher || pitch.pitcher || '—';
  pitch.pitcherId = selectedPitcher?.id || pitch.pitcherId || '';
  pitch.pitcherNumber = selectedPitcher?.number || pitch.pitcherNumber || '';
  pitch.batter = selectedBatter?.name || customBatter || pitch.batter || '—';
  pitch.batterId = selectedBatter?.id || pitch.batterId || '';
  pitch.batterNumber = selectedBatter?.number || pitch.batterNumber || '';
  if (selectedPitcher) pitch.pitcherOrder = state.lineups[fieldingTeam].pitchers.findIndex(player => player.id === selectedPitcher.id) + 1;
  if (selectedBatter) pitch.batterOrder = state.lineups[battingTeam].batters.findIndex(player => player.id === selectedBatter.id) + 1;
  pitch.bats = selectedBatter?.bats || pitch.bats;
  pitch.type = $('editPitchType').value;
  pitch.group = pitchGroupForType(pitch.type);
  pitch.velocity = $('editVelocity').value;
  pitch.result = scoredResult;
  pitch.contactType = isInPlayResult(scoredResult) ? $('editContact').value : '';
  pitch.outLocation = ['In play - out', 'Double play'].includes(scoredResult) ? $('editOutPosition').value : '';
  pitch.errorLocation = scoredResult === 'Error' ? $('editErrorPosition').value : '';
  pitch.note = $('editNote').value.trim();
  pitch.location = editingPitchLocation ? {...editingPitchLocation} : null;
  restoreCsvContext(csvContext);
  if (isLastPitch && changesGameSituation) {
    restoreGameSituation(situationBeforeEdit);
    const outcome = advanceGame(pitch.result);
    if (outcome.plateAppearanceEnded) moveToNextBatter(false, battingTeam);
    if (outcome.inningChanged) syncPlayersForHalf();
  } else {
    restoreGameSituation(currentSituation);
  }
  render(); save(); $('editPitchDialog').close(); showToast(`Pitch #${pitch.number} updated`);
});

$('recordButton').addEventListener('click', () => {
  const battingTeam = $('half').value === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const batterPlayer = state.lineups[battingTeam].batters.find(player => player.name === $('batter').value);
  const pitcherPlayer = state.lineups[fieldingTeam].pitchers.find(player => player.name === $('pitcher').value);
  const batterOrder = batterPlayer ? state.lineups[battingTeam].batters.findIndex(player => player.id === batterPlayer.id) + 1 : '';
  const pitcherOrder = pitcherPlayer ? state.lineups[fieldingTeam].pitchers.findIndex(player => player.id === pitcherPlayer.id) + 1 : '';
  const recordedAt = new Date();
  const recordedResult = state.result || (state.contactType ? 'In play' : 'Not recorded');
  const count = `${state.balls}-${state.strikes}`;
  const scoredResult = scoredResultForCount(recordedResult, count);
  const situationBeforePitch = currentGameSituation();
  if (resultWouldChangeInning(recordedResult) && !confirm('This pitch will make 3 outs and move to the next half inning. Continue?')) {
    showToast('Pitch not recorded');
    return;
  }
  const pitch = {
    number: state.pitches.length + 1, inning: $('inning').value, half: $('half').value,
    time: recordedAt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}),
    recordedAt: recordedAt.toISOString(),
    count, outs: state.outs,
    pitcher: $('pitcher').value.trim() || '—', pitcherId: pitcherPlayer?.id || '', pitcherNumber: pitcherPlayer?.number || '', pitcherOrder,
    batter: $('batter').value.trim() || '—', batterId: batterPlayer?.id || '', batterNumber: batterPlayer?.number || '', batterOrder, bats: $('bats').value,
    type: state.pitchType, group: state.pitchGroup, velocity: $('velocity').value || '',
    result: scoredResult, contactType: isInPlayResult(scoredResult) ? (state.contactType || '') : '', outLocation: ['In play - out', 'Double play'].includes(scoredResult) ? state.outLocation : '', errorLocation: scoredResult === 'Error' ? state.errorLocation : '',
    note: $('note').value.trim(), location: state.location ? {...state.location} : null
  };
  state.pitches.push(pitch);
  const outcome = advanceGame(pitch.result);
  if (!confirmBatterAdvance(outcome, battingTeam)) {
    state.pitches.pop();
    restoreGameSituation(situationBeforePitch);
    render();
    save();
    showToast('Pitch not recorded');
    return;
  }
  if (outcome.plateAppearanceEnded) moveToNextBatter(false, battingTeam);
  if (outcome.inningChanged) syncPlayersForHalf();
  state.location = null; state.result = null; state.contactType = null; state.outLocation = ''; state.errorLocation = '';
  $('crosshair').classList.remove('visible');
  ['basicResults','contactTypes','inPlayResults'].forEach(id => $(id).querySelectorAll('button').forEach(button => button.classList.remove('selected')));
  $('outPositions').querySelectorAll('button').forEach(button => button.classList.remove('selected'));
  $('errorPositions').querySelectorAll('button').forEach(button => button.classList.remove('selected'));
  $('outLocationWrap').hidden = true;
  $('errorLocationWrap').hidden = true;
  $('note').value = '';
  $('zoneHelp').textContent = 'Location is optional — tap the zone if you want to chart it.';
  updateRecordButton(); render(); save();
  const update = outcome.inningChanged ? `${$('half').value} ${$('inning').value}` : outcome.outRecorded ? `${state.outs} out${state.outs === 1 ? '' : 's'}` : outcome.label;
  showToast(`Pitch #${pitch.number} recorded${update ? ` · ${update}` : ''}`);
});

function advanceGame(result) {
  let plateAppearanceEnded = false;
  let outRecorded = false;
  let inningChanged = false;
  let label = '';
  if (result === 'Ball') state.balls++;
  if (['Called strike', 'Swinging strike'].includes(result)) state.strikes++;
  if (result === 'Foul' && state.strikes < 2) state.strikes++;
  if (state.balls >= 4 || result === 'Walk') { plateAppearanceEnded = true; label = 'Walk'; }
  if (result === 'HBP') { plateAppearanceEnded = true; label = 'HBP'; }
  if (state.strikes >= 3 || result === 'Strikeout') { plateAppearanceEnded = true; outRecorded = true; label = 'Strikeout'; }
  if (result === 'In play - out') { plateAppearanceEnded = true; outRecorded = true; label = 'Out in play'; }
  if (result === 'Double play') { plateAppearanceEnded = true; outRecorded = true; label = 'Double play'; }
  if (['Single', 'Double', 'Triple', 'Home run', 'In play - hit', 'Error'].includes(result)) { plateAppearanceEnded = true; label = result === 'In play - hit' ? 'Hit' : result; }
  if (outRecorded) inningChanged = recordOut(result === 'Double play' ? 2 : 1);
  if (plateAppearanceEnded) { state.balls = 0; state.strikes = 0; }
  return {plateAppearanceEnded, outRecorded, inningChanged, label};
}

function recordOut(outsToAdd = 1) {
  state.outs += outsToAdd;
  if (state.outs < 3) { updateOutButtons(); return false; }
  state.outs = 0;
  if ($('half').value === 'Top') {
    $('half').value = 'Bottom';
  } else {
    $('half').value = 'Top';
    const nextInning = Number($('inning').value) + 1;
    if (![...$('inning').options].some(option => Number(option.value) === nextInning)) $('inning').add(new Option(nextInning, nextInning));
    $('inning').value = String(nextInning);
  }
  updateOutButtons();
  return true;
}

function formatPitchResult(pitch) {
  if (pitch.result === 'Error') return [pitch.result, pitch.contactType, pitch.errorLocation].filter(Boolean).join(' · ');
  if (!pitch.contactType) return pitch.result;
  const result = pitch.result === 'In play - out' ? 'Out' : pitch.result === 'Double play' ? 'DP' : pitch.result;
  return [result, pitch.contactType, pitch.outLocation || pitch.errorLocation].filter(Boolean).join(' · ');
}

function teamName(team) {
  return $(team === 'home' ? 'homeTeam' : 'awayTeam').value.trim() || capitalize(team);
}

function pitchHalf(pitch) {
  return pitch.half === 'Bottom' ? 'Bottom' : 'Top';
}

function pitchInning(pitch) {
  const inning = Number(pitch.inning);
  return Number.isFinite(inning) && inning > 0 ? String(inning) : '1';
}

function pitchInningLabel(pitch) {
  return `${pitchHalf(pitch)} ${pitchInning(pitch)}`;
}

function pitchBattingTeam(pitch) {
  return pitchHalf(pitch) === 'Top' ? 'away' : 'home';
}

function pitchFieldingTeam(pitch) {
  return pitchBattingTeam(pitch) === 'away' ? 'home' : 'away';
}

function countBefore(pitch) {
  const [balls = 0, strikes = 0] = String(pitch.count || '0-0').split('-').map(Number);
  return {balls, strikes};
}

function scoredResultForCount(result, count) {
  const [balls = 0, strikes = 0] = String(count || '0-0').split('-').map(Number);
  if (result === 'Ball' && balls >= 3) return 'Walk';
  if (['Called strike', 'Swinging strike'].includes(result) && strikes >= 2) return 'Strikeout';
  return result;
}

function outcomeOuts(outcome) {
  if (outcome.dp) return 2;
  return (outcome.strikeout || outcome.out) ? 1 : 0;
}

function outcomeLabel(outcome, result) {
  if (outcome.walk) return 'walk';
  if (outcome.strikeout) return 'strikeout';
  if (outcome.hbp) return 'HBP';
  if (outcome.hit) return result;
  if (outcome.dp) return 'double play';
  if (outcome.out) return 'out';
  if (outcome.error) return 'error';
  return result || 'pitch';
}

function resultAffectsGameFlow(result) {
  return ['Ball', 'Walk', 'Called strike', 'Swinging strike', 'Foul', 'Strikeout', 'HBP', 'Single', 'Double', 'Triple', 'Home run', 'In play - hit', 'In play - out', 'Double play', 'Error'].includes(result);
}

function situationBeforePitch(pitch) {
  const situation = currentGameSituation();
  const {balls, strikes} = countBefore(pitch);
  const battingTeam = pitchBattingTeam(pitch);
  const fieldingTeam = pitchFieldingTeam(pitch);
  const order = state.lineups[battingTeam].batters.filter(player => player.name);
  const batterIndex = order.findIndex(player => (
    (pitch.batterId && player.id === pitch.batterId) ||
    (pitch.batter && normalizePlayerName(player.name) === normalizePlayerName(pitch.batter)) ||
    (pitch.batterNumber && player.number && String(player.number) === String(pitch.batterNumber))
  ));
  const pitchers = state.lineups[fieldingTeam].pitchers.filter(player => player.name);
  const pitcher = pitchers.find(player => (
    (pitch.pitcherId && player.id === pitch.pitcherId) ||
    (pitch.pitcher && normalizePlayerName(player.name) === normalizePlayerName(pitch.pitcher)) ||
    (pitch.pitcherNumber && player.number && String(player.number) === String(pitch.pitcherNumber))
  ));
  situation.balls = balls;
  situation.strikes = strikes;
  situation.outs = Number(pitch.outs) || 0;
  situation.inning = pitchInning(pitch);
  situation.half = pitchHalf(pitch);
  situation.pitcher = pitcher?.name || pitch.pitcher || '';
  situation.batter = order[batterIndex]?.name || pitch.batter || '';
  situation.bats = order[batterIndex]?.bats || pitch.bats || 'R';
  if (batterIndex >= 0) situation.battingIndexes[battingTeam] = batterIndex;
  if (pitcher) situation.selectedPitchers[fieldingTeam] = pitcher.name;
  return situation;
}

function blankBattingStats(label, team) {
  return {label, team, pa: 0, ab: 0, h: 0, doubles: 0, triples: 0, hr: 0, bb: 0, k: 0, hbp: 0, roe: 0};
}

function blankPitchingStats(label, team) {
  return {label, team, pitches: 0, strikes: 0, balls: 0, h: 0, bb: 0, k: 0, hbp: 0, outs: 0};
}

function isHitResult(result) {
  return ['Single', 'Double', 'Triple', 'Home run', 'In play - hit'].includes(result);
}

function isStrikeResult(result) {
  return ['Called strike', 'Swinging strike', 'Foul', 'Strikeout', 'Single', 'Double', 'Triple', 'Home run', 'In play - hit', 'In play - out', 'Double play', 'Error'].includes(result);
}

function pitchOutcome(pitch) {
  const {balls, strikes} = countBefore(pitch);
  const result = pitch.result;
  const walk = result === 'Walk' || (result === 'Ball' && balls >= 3);
  const strikeout = result === 'Strikeout' || (['Called strike', 'Swinging strike'].includes(result) && strikes >= 2);
  const hbp = result === 'HBP';
  const hit = isHitResult(result);
  const out = result === 'In play - out';
  const dp = result === 'Double play';
  const error = result === 'Error';
  const terminal = walk || strikeout || hbp || hit || out || dp || error;
  return {walk, strikeout, hbp, hit, out, dp, error, terminal};
}

function scorebookPosition(position) {
  return {P: '1', C: '2', '1B': '3', '2B': '4', '3B': '5', SS: '6', LF: '7', CF: '8', RF: '9'}[position] || position || '';
}

function contactCode(contactType) {
  if (contactType === 'Fly ball') return 'F';
  if (contactType === 'Ground ball') return 'GB';
  if (contactType === 'Line drive') return 'LD';
  if (contactType === 'Pop up') return 'P';
  return '';
}

function atBatCode(pitch, outcome = pitchOutcome(pitch)) {
  if (!outcome.terminal) return '';
  if (outcome.walk) return 'BB';
  if (outcome.strikeout) return 'K';
  if (outcome.hbp) return 'HBP';
  if (pitch.result === 'Single') return 'H1';
  if (pitch.result === 'Double') return 'H2';
  if (pitch.result === 'Triple') return 'H3';
  if (pitch.result === 'Home run') return 'H4';
  if (pitch.result === 'In play - hit') return 'H';
  if (outcome.error) return `E${scorebookPosition(pitch.errorLocation)}`;
  if (outcome.dp) {
    const contact = contactCode(pitch.contactType);
    const position = scorebookPosition(pitch.outLocation);
    return `DP${contact || position ? ` · ${contact}${position}` : ''}`;
  }
  if (outcome.out) return `${contactCode(pitch.contactType)}${scorebookPosition(pitch.outLocation)}` || 'OUT';
  return pitch.result || '';
}

function avgText(hits, atBats) {
  if (!atBats) return '—';
  return (hits / atBats).toFixed(3).replace(/^0/, '');
}

function pctText(part, total) {
  return total ? `${Math.round((part / total) * 100)}%` : '—';
}

function addBattingOutcome(stats, pitch, outcome) {
  if (!outcome.terminal) return;
  stats.pa++;
  if (!outcome.walk && !outcome.hbp) stats.ab++;
  if (outcome.hit) stats.h++;
  if (pitch.result === 'Double') stats.doubles++;
  if (pitch.result === 'Triple') stats.triples++;
  if (pitch.result === 'Home run') stats.hr++;
  if (outcome.walk) stats.bb++;
  if (outcome.strikeout) stats.k++;
  if (outcome.hbp) stats.hbp++;
  if (outcome.error) stats.roe++;
}

function boxScoreStats() {
  const teamStats = {away: blankBattingStats(teamName('away'), 'away'), home: blankBattingStats(teamName('home'), 'home')};
  const batterStats = new Map();
  const pitcherStats = new Map();
  const pitchTypes = new Map();
  const atBatsByInning = [];

  state.pitches.forEach((pitch) => {
    const battingTeam = pitchBattingTeam(pitch);
    const fieldingTeam = pitchFieldingTeam(pitch);
    const outcome = pitchOutcome(pitch);
    const batterLabel = `${pitch.batterNumber ? `#${pitch.batterNumber} ` : ''}${pitch.batter || '—'}`;
    const batterKey = `${battingTeam}:${pitch.batterId || pitch.batter || 'unknown'}`;
    const pitcherLabel = `${pitch.pitcherNumber ? `#${pitch.pitcherNumber} ` : ''}${pitch.pitcher || '—'}`;
    const pitcherKey = `${fieldingTeam}:${pitch.pitcherId || pitch.pitcher || 'unknown'}`;
    const typeKey = pitch.type || 'Not recorded';

    addBattingOutcome(teamStats[battingTeam], pitch, outcome);
    if (outcome.terminal) atBatsByInning.push({pitch, battingTeam, batterLabel, code: atBatCode(pitch, outcome)});
    if (!batterStats.has(batterKey)) batterStats.set(batterKey, blankBattingStats(batterLabel, battingTeam));
    addBattingOutcome(batterStats.get(batterKey), pitch, outcome);

    if (!pitcherStats.has(pitcherKey)) pitcherStats.set(pitcherKey, blankPitchingStats(pitcherLabel, fieldingTeam));
    const pitcher = pitcherStats.get(pitcherKey);
    pitcher.pitches++;
    if (isStrikeResult(pitch.result)) pitcher.strikes++;
    if (pitch.result === 'Ball') pitcher.balls++;
    if (outcome.hit) pitcher.h++;
    if (outcome.walk) pitcher.bb++;
    if (outcome.strikeout) pitcher.k++;
    if (outcome.hbp) pitcher.hbp++;
    if (outcome.strikeout || outcome.out) pitcher.outs++;
    if (outcome.dp) pitcher.outs += 2;

    if (!pitchTypes.has(typeKey)) pitchTypes.set(typeKey, {label: typeKey, total: 0, strikes: 0, velocities: [], whiffs: 0, inPlay: 0});
    const pitchType = pitchTypes.get(typeKey);
    pitchType.total++;
    if (isStrikeResult(pitch.result)) pitchType.strikes++;
    if (Number(pitch.velocity)) pitchType.velocities.push(Number(pitch.velocity));
    if (pitch.result === 'Swinging strike') pitchType.whiffs++;
    if (isInPlayResult(pitch.result)) pitchType.inPlay++;
  });

  return {teamStats, batterStats: [...batterStats.values()], pitcherStats: [...pitcherStats.values()], pitchTypes: [...pitchTypes.values()], atBatsByInning};
}

function scorecardPlayers(team, atBatsByInning) {
  const players = [];
  state.lineups[team].batters.forEach((player, index) => {
    if (player.substitutedFor) {
      players.push({
        key: `${team}:name:${normalizePlayerName(player.substitutedFor)}`,
        aliases: [
          normalizePlayerName(player.substitutedFor),
          player.substitutedForNumber ? `number:${String(player.substitutedForNumber)}` : ''
        ].filter(Boolean),
        order: index + 1,
        name: player.substitutedFor,
        number: player.substitutedForNumber || '',
        position: player.substitutedForPosition || player.position || '',
        note: 'Started'
      });
      players.push({
        key: player.id || `${team}:lineup:${index}:sub`,
        aliases: scorecardAliases(player),
        order: `${index + 1}S`,
        name: player.name || `Sub for ${player.substitutedFor}`,
        number: player.number || '',
        position: player.position || '',
        note: `Entered ${player.substitutionAt || ''}`.trim()
      });
      return;
    }
    players.push({
      key: player.id || `${team}:lineup:${index}`,
      aliases: scorecardAliases(player),
      order: index + 1,
      name: player.name || `Player ${index + 1}`,
      number: player.number || '',
      position: player.position || '',
      note: ''
    });
  });
  atBatsByInning.filter(item => item.battingTeam === team).forEach(({pitch}) => {
    const key = pitch.batterId || `${team}:name:${pitch.batter || 'unknown'}`;
    if (findScorecardPlayer(players, pitch)) return;
    if (players.length) return;
    players.push({
      key,
      aliases: [
        pitch.batterId,
        normalizePlayerName(pitch.batter),
        pitch.batterNumber ? `number:${String(pitch.batterNumber)}` : ''
      ].filter(Boolean),
      order: players.length + 1,
      name: pitch.batter || '—',
      number: pitch.batterNumber || '',
      position: '',
      note: 'From pitch history'
    });
  });
  return players;
}

function scorecardFallbackPlayer(players, item, atBatIndex) {
  return findScorecardPlayer(players, item.pitch) ||
    (item.pitch.batterOrder ? players[Number(item.pitch.batterOrder) - 1] : null) ||
    players[atBatIndex % players.length] ||
    null;
}

function renderScorecardTeam(team, atBatsByInning, innings) {
  const players = scorecardPlayers(team, atBatsByInning);
  const cells = new Map();
  atBatsByInning.filter(item => item.battingTeam === team).forEach((item, atBatIndex) => {
    const key = item.pitch.batterId || `${team}:name:${item.pitch.batter || 'unknown'}`;
    const player = scorecardFallbackPlayer(players, item, atBatIndex);
    const cellKey = `${player?.key || key}:${item.pitch.inning}`;
    if (!cells.has(cellKey)) cells.set(cellKey, []);
    cells.get(cellKey).push(item.code);
  });

  return `
    <div class="scorecard-table-wrap">
      <div class="scorecard-title"><span>${escapeHtml(teamName(team))}</span><small>${team === 'away' ? 'Top innings' : 'Bottom innings'}</small></div>
      <table class="scorecard-grid">
        <thead><tr><th class="order-head">#</th><th class="player-head">Batter</th><th class="pos-head">Pos</th>${innings.map(inning => `<th>${inning}</th>`).join('')}</tr></thead>
        <tbody>${players.map((player) => `
          <tr>
            <td class="scorecard-order">${player.order}</td>
            <td class="scorecard-player">${player.number ? `#${escapeHtml(player.number)} ` : ''}${escapeHtml(player.name)}${player.note ? `<small>${escapeHtml(player.note)}</small>` : ''}</td>
            <td class="scorecard-pos">${escapeHtml(player.position || '—')}</td>
            ${innings.map((inning) => {
              const codes = cells.get(`${player.key}:${inning}`) || [];
              return `<td>${codes.map(code => `<span class="scorecard-code">${escapeHtml(code)}</span>`).join('')}</td>`;
            }).join('')}
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function scorecardPdfData(team, atBatsByInning, innings) {
  const players = scorecardPlayers(team, atBatsByInning);
  const cells = new Map();
  atBatsByInning.filter(item => item.battingTeam === team).forEach((item, atBatIndex) => {
    const key = item.pitch.batterId || `${team}:name:${item.pitch.batter || 'unknown'}`;
    const player = scorecardFallbackPlayer(players, item, atBatIndex);
    const cellKey = `${player?.key || key}:${item.pitch.inning}`;
    if (!cells.has(cellKey)) cells.set(cellKey, []);
    cells.get(cellKey).push(item.code);
  });
  return {
    teamName: teamName(team),
    innings,
    players: players.map((player) => ({
      order: String(player.order),
      name: player.name,
      number: player.number,
      position: player.position,
      note: player.note,
      cells: Object.fromEntries(innings.map(inning => [inning, cells.get(`${player.key}:${inning}`) || []]))
    }))
  };
}

function renderInningScorecard(atBatsByInning) {
  const maxPitchInning = Math.max(9, ...state.pitches.map(pitch => Number(pitch.inning) || 1));
  const innings = Array.from({length: maxPitchInning}, (_, index) => index + 1);
  $('inningAtBatRows').innerHTML = `${renderScorecardTeam('away', atBatsByInning, innings)}${renderScorecardTeam('home', atBatsByInning, innings)}`;
}

function statsPdfData() {
  const stats = boxScoreStats();
  const maxPitchInning = Math.max(9, ...state.pitches.map(pitch => Number(pitch.inning) || 1));
  const innings = Array.from({length: maxPitchInning}, (_, index) => index + 1);
  return {
    date: $('gameDate').value,
    homeName: teamName('home'),
    awayName: teamName('away'),
    teamRows: ['away', 'home'].map((team) => {
      const s = stats.teamStats[team];
      return [s.label, s.pa, s.ab, s.h, s.doubles, s.triples, s.hr, s.bb, s.k, s.hbp, s.roe, avgText(s.h, s.ab)];
    }),
    pitcherRows: stats.pitcherStats
      .sort((a, b) => a.team.localeCompare(b.team) || b.pitches - a.pitches || a.label.localeCompare(b.label))
      .map(s => [s.label, teamName(s.team), s.pitches, pctText(s.strikes, s.pitches), s.h, s.bb, s.k, s.hbp, s.outs]),
    batterRows: stats.batterStats
      .filter(s => s.pa)
      .sort((a, b) => a.team.localeCompare(b.team) || b.pa - a.pa || a.label.localeCompare(b.label))
      .map(s => [s.label, teamName(s.team), s.pa, s.ab, s.h, s.doubles, s.triples, s.hr, s.bb, s.k, avgText(s.h, s.ab)]),
    awayScorecard: scorecardPdfData('away', stats.atBatsByInning, innings),
    homeScorecard: scorecardPdfData('home', stats.atBatsByInning, innings),
    pitchTypeRows: stats.pitchTypes
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
      .map((s) => {
        const avgVelocity = s.velocities.length ? Math.round(s.velocities.reduce((total, mph) => total + mph, 0) / s.velocities.length) : '-';
        return [s.label, s.total, pctText(s.strikes, s.total), avgVelocity, s.whiffs, s.inPlay];
      })
  };
}

function renderBoxScore() {
  const stats = boxScoreStats();
  const teamRows = ['away', 'home'].map((team) => {
    const s = stats.teamStats[team];
    return `<tr><td><b>${escapeHtml(s.label)}</b></td><td>${s.pa}</td><td>${s.ab}</td><td>${s.h}</td><td>${s.doubles}</td><td>${s.triples}</td><td>${s.hr}</td><td>${s.bb}</td><td>${s.k}</td><td>${s.hbp}</td><td>${s.roe}</td><td>${avgText(s.h, s.ab)}</td></tr>`;
  }).join('');
  $('teamBoxRows').innerHTML = teamRows;
  $('batterBoxRows').innerHTML = stats.batterStats
    .filter(s => s.pa)
    .sort((a, b) => a.team.localeCompare(b.team) || b.pa - a.pa || a.label.localeCompare(b.label))
    .map(s => `<tr><td><b>${escapeHtml(s.label)}</b></td><td>${escapeHtml(teamName(s.team))}</td><td>${s.pa}</td><td>${s.ab}</td><td>${s.h}</td><td>${s.doubles}</td><td>${s.triples}</td><td>${s.hr}</td><td>${s.bb}</td><td>${s.k}</td><td>${s.hbp}</td><td>${s.roe}</td><td>${avgText(s.h, s.ab)}</td></tr>`)
    .join('');
  $('pitcherBoxRows').innerHTML = stats.pitcherStats
    .sort((a, b) => a.team.localeCompare(b.team) || b.pitches - a.pitches || a.label.localeCompare(b.label))
    .map(s => `<tr><td><b>${escapeHtml(s.label)}</b></td><td>${escapeHtml(teamName(s.team))}</td><td>${s.pitches}</td><td>${pctText(s.strikes, s.pitches)}</td><td>${s.h}</td><td>${s.bb}</td><td>${s.k}</td><td>${s.hbp}</td><td>${s.outs}</td></tr>`)
    .join('');
  renderInningScorecard(stats.atBatsByInning);
  $('pitchTypeBoxRows').innerHTML = stats.pitchTypes
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .map(s => {
      const avgVelocity = s.velocities.length ? Math.round(s.velocities.reduce((total, mph) => total + mph, 0) / s.velocities.length) : '—';
      return `<tr><td><b>${escapeHtml(s.label)}</b></td><td>${s.total}</td><td>${pctText(s.strikes, s.total)}</td><td>${avgVelocity}</td><td>${s.whiffs}</td><td>${s.inPlay}</td></tr>`;
    })
    .join('');
  const totalPa = stats.teamStats.away.pa + stats.teamStats.home.pa;
  const totalHits = stats.teamStats.away.h + stats.teamStats.home.h;
  const totalK = stats.teamStats.away.k + stats.teamStats.home.k;
  $('boxScoreSummary').innerHTML = `<span><b>${totalPa}</b> PA</span><span><b>${totalHits}</b> hits</span><span><b>${totalK}</b> K</span>`;
  $('boxScoreEmpty').hidden = state.pitches.length > 0;
}

function render() {
  $('ballCount').textContent = state.balls; $('strikeCount').textContent = state.strikes;
  $('zoneBody').hidden = state.uiHidden.zone;
  $('historyBody').hidden = state.uiHidden.history;
  $('boxScoreBody').hidden = state.uiHidden.boxScore;
  $('toggleZone').textContent = state.uiHidden.zone ? 'Show zone' : 'Hide zone';
  $('toggleHistory').textContent = state.uiHidden.history ? 'Show history' : 'Hide history';
  $('toggleBoxScore').textContent = state.uiHidden.boxScore ? 'Show stats' : 'Hide stats';
  $('toggleZone').setAttribute('aria-expanded', String(!state.uiHidden.zone));
  $('toggleHistory').setAttribute('aria-expanded', String(!state.uiHidden.history));
  $('toggleBoxScore').setAttribute('aria-expanded', String(!state.uiHidden.boxScore));
  $('pitchNumber').textContent = `#${state.pitches.length + 1}`;
  $('emptyState').hidden = state.pitches.length > 0;
  $('undoButton').disabled = state.pitches.length === 0;
  updateResetButtonState();
  $('pitchMarkers').innerHTML = state.pitches.filter(pitch => pitch.location).map((pitch) => `<span class="pitch-marker ${pitch.group}" style="left:${pitch.location.x}%;top:${pitch.location.y}%" title="#${pitch.number} ${escapeHtml(pitch.type)} — ${escapeHtml(formatPitchResult(pitch))}">${pitch.number}</span>`).join('');
  $('pitchLog').innerHTML = state.pitches.slice().reverse().map((pitch) => `<tr class="pitch-log-row" data-pitch-number="${pitch.number}" tabindex="0" title="Tap to edit pitch #${pitch.number}"><td><b>${pitch.number}</b></td><td>${pitch.half[0]} ${pitch.inning}</td><td>${pitch.count}</td><td>${pitch.pitcherNumber ? `#${escapeHtml(pitch.pitcherNumber)} ` : ''}${escapeHtml(pitch.pitcher)}</td><td>${pitch.batterNumber ? `#${escapeHtml(pitch.batterNumber)} ` : ''}${escapeHtml(pitch.batter)}</td><td>${escapeHtml(pitch.type)}</td><td>${pitch.velocity ? `${escapeHtml(pitch.velocity)} mph` : '—'}</td><td>${escapeHtml(formatPitchResult(pitch))}</td><td>${locationName(pitch.location)}</td><td><button class="delete-pitch" data-delete-pitch="${pitch.number}" type="button" title="Delete pitch #${pitch.number}">Delete</button></td></tr>`).join('');
  const velocities = state.pitches.map(p => Number(p.velocity)).filter(Boolean);
  const avg = velocities.length ? Math.round(velocities.reduce((a,b) => a+b, 0) / velocities.length) : '—';
  const strikes = state.pitches.filter(p => ['Called strike','Swinging strike','Foul','Strikeout','In play - hit'].includes(p.result) || ['Single','Double','Triple','Home run','In play - out','Double play'].includes(p.result)).length;
  const rate = state.pitches.length ? Math.round(strikes / state.pitches.length * 100) : 0;
  $('summary').innerHTML = `<span><b>${state.pitches.length}</b> pitches</span><span><b>${avg}</b> avg mph</span><span><b>${rate}%</b> strikes</span>`;
  renderBoxScore();
}

function renumberPitches() {
  state.pitches.forEach((pitch, index) => { pitch.number = index + 1; });
}

function deletePitch(number) {
  const index = state.pitches.findIndex(pitch => pitch.number === number);
  if (index < 0 || !confirm(`Delete pitch #${number}? This will recalculate the game after that pitch.`)) return;
  state.pitches.splice(index, 1);
  renumberPitches();
  if (state.pitches.length) replayGameState();
  else {
    state.balls = 0; state.strikes = 0; state.outs = 0;
    $('inning').value = '1'; $('half').value = 'Top';
    syncPlayersForHalf();
  }
  updateOutButtons();
  render();
  save();
  showToast(`Pitch #${number} deleted`);
}

$('pitchLog').addEventListener('click', (event) => {
  const deleteButton = event.target.closest('[data-delete-pitch]');
  if (deleteButton) {
    deletePitch(Number(deleteButton.dataset.deletePitch));
    return;
  }
  const row = event.target.closest('.pitch-log-row');
  if (row) openPitchEditor(Number(row.dataset.pitchNumber));
});
$('pitchLog').addEventListener('keydown', (event) => {
  const row = event.target.closest('.pitch-log-row');
  if (row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openPitchEditor(Number(row.dataset.pitchNumber)); }
});

$('undoButton').addEventListener('click', () => {
  if (!state.pitches.length) return;
  const removed = state.pitches.pop();
  [state.balls, state.strikes] = removed.count.split('-').map(Number);
  state.outs = Number(removed.outs);
  $('inning').value = String(removed.inning);
  $('half').value = removed.half;
  syncPlayersForHalf();
  if ([...$('batter').options].some(option => option.value === removed.batter)) $('batter').value = removed.batter;
  if ([...$('pitcher').options].some(option => option.value === removed.pitcher)) $('pitcher').value = removed.pitcher;
  $('bats').value = removed.bats;
  updateOutButtons(); render(); save(); showToast('Last pitch removed');
});
$('resetButton').addEventListener('click', () => {
  if (!hasGameContent() || !confirm('Reset this game? This will clear pitch history, team names, and lineups for this saved game.')) return;
  applyGameData(blankGameData());
  editingTeam = 'away';
  $('teamTabs').querySelectorAll('.team-tab').forEach((button) => {
    const active = button.dataset.team === editingTeam;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  clearPitchEntryForm();
  updateLineupLabels();
  updateLineupCount();
  save();
  showToast('Game reset');
});

$('exportButton').addEventListener('click', () => {
  if (!state.pitches.length) return showToast('Record a pitch before exporting');
  const headers = ['Pitch #','Date','Time','Home Team','Away Team','Inning Label','Inning','Half','Batting Team','Fielding Team','Outs','Count','Pitcher #','Pitcher','Batter #','Batter','Bats','Pitch Type','Velocity','Result','Contact Type','Out Position','Error Position','Location','X %','Y %','Note'];
  const rows = state.pitches.map((p) => {
    const battingTeam = pitchBattingTeam(p);
    const fieldingTeam = pitchFieldingTeam(p);
    return [p.number,$('gameDate').value,p.time || '',$('homeTeam').value,$('awayTeam').value,pitchInningLabel(p),pitchInning(p),pitchHalf(p),teamName(battingTeam),teamName(fieldingTeam),p.outs,p.count,p.pitcherNumber || '',p.pitcher,p.batterNumber || '',p.batter,p.bats,p.type,p.velocity,p.result,p.contactType || '',p.outLocation || '',p.errorLocation || '',locationName(p.location),p.location ? p.location.x.toFixed(1) : '',p.location ? p.location.y.toFixed(1) : '',p.note];
  });
  const csv = [headers,...rows].map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  link.download = `${gameFileBase()}_pitch-chart.csv`; link.click(); URL.revokeObjectURL(link.href);
  showToast('Pitch chart exported');
});

function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function showToast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => $('toast').classList.remove('show'), 2200); }

function save() {
  persistGames();
}

function ensurePlayerLinks() {
  ['home', 'away'].forEach((team) => {
    state.lineups[team].batters.forEach(player => { if (!player.id) player.id = createPlayerId('batter'); });
    state.lineups[team].pitchers.forEach(player => { if (!player.id) player.id = createPlayerId('pitcher'); });
  });
  state.pitches.forEach((pitch) => {
    const battingTeam = pitch.half === 'Top' ? 'away' : 'home';
    const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
    const batter = state.lineups[battingTeam].batters.find(player => player.name && player.name === pitch.batter);
    const pitcher = state.lineups[fieldingTeam].pitchers.find(player => player.name && player.name === pitch.pitcher);
    if (!pitch.batterId && batter) pitch.batterId = batter.id;
    if (!pitch.pitcherId && pitcher) pitch.pitcherId = pitcher.id;
  });
}

function load() {
  loadTeams();
  try {
    const store = JSON.parse(localStorage.getItem(GAMES_KEY));
    if (store?.games?.length) {
      savedGames = store.games;
      activeGameId = store.activeGameId || savedGames[0].id;
      const active = savedGames.find(game => game.id === activeGameId) || savedGames[0];
      activeGameId = active.id;
      applyGameData(clone(active.data));
      persistGames();
      return;
    }
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const data = legacy || blankGameData();
    if (data.lineup && !data.lineups) data.lineups = {home: createLineup(), away: data.lineup};
    activeGameId = createGameId();
    savedGames = [{id: activeGameId, title: gameTitle(data), updatedAt: new Date().toISOString(), pitches: data.pitches?.length || 0, data}];
    applyGameData(clone(data));
    persistGames();
  } catch (_) {
    localStorage.removeItem(GAMES_KEY);
    localStorage.removeItem(STORAGE_KEY);
    activeGameId = createGameId();
    savedGames = [{id: activeGameId, title: 'New game', updatedAt: new Date().toISOString(), pitches: 0, data: blankGameData()}];
    applyGameData(clone(savedGames[0].data));
    persistGames();
  }
}
fields.forEach(id => $(id).addEventListener('change', () => { updateResetButtonState(); save(); }));
['homeTeam', 'awayTeam'].forEach(id => $(id).addEventListener('input', () => {
  updateLineupLabels();
  updateLineupCount();
  updateResetButtonState();
  openTeamPicker(id === 'homeTeam' ? 'home' : 'away');
}));
['homeTeam', 'awayTeam'].forEach((id) => $(id).addEventListener('change', () => {
  loadSavedTeamFromName(id === 'homeTeam' ? 'home' : 'away');
}));
['homeTeam', 'awayTeam'].forEach((id) => $(id).addEventListener('focus', () => {
  openTeamPicker(id === 'homeTeam' ? 'home' : 'away');
}));
document.addEventListener('click', (event) => {
  const option = event.target.closest('[data-team-picker]');
  if (option) {
    loadTeamIntoSide(option.dataset.teamId, option.dataset.teamPicker);
    closeTeamPickers();
    return;
  }
  const createTeamButton = event.target.closest('[data-create-team-from-picker]');
  if (createTeamButton) {
    createTeamFromPicker(createTeamButton.dataset.createTeamFromPicker);
    return;
  }
  if (event.target.closest('[data-open-teams-from-picker]')) {
    const activePicker = event.target.closest('.team-picker');
    openTeamsManagerForName(activePicker?.querySelector('input')?.value.trim() || '');
    return;
  }
  if (!event.target.closest('.team-picker')) closeTeamPickers();
});
load(); renderLineupOptions(); render();
