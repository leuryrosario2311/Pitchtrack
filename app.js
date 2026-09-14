const STORAGE_KEY = 'pitchtrack-game-v1';
const GAMES_KEY = 'pitchtrack-games-v1';
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
let activeGameId = '';
let savedGames = [];

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
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) $('installButton').hidden = true;
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

function buildLineupEditor() {
  updateLineupLabels();
  const lineup = state.lineups[editingTeam];
  $('battingLineup').innerHTML = lineup.batters.map((player, index) => `
    <div class="lineup-row batting" data-player-id="${player.id}" data-substituted-for="${escapeHtml(player.substitutedFor || '')}" data-substituted-for-number="${escapeHtml(player.substitutedForNumber || '')}" data-substituted-for-position="${escapeHtml(player.substitutedForPosition || '')}" data-substituted-for-bats="${escapeHtml(player.substitutedForBats || '')}" data-substitution-at="${escapeHtml(player.substitutionAt || '')}">
      <span class="order-number">${index + 1}</span>
      <div class="lineup-player-cell"><input class="lineup-name" data-kind="batter" data-index="${index}" value="${escapeHtml(player.name)}" placeholder="${escapeHtml(player.substitutedFor ? `Sub for ${player.substitutedFor}` : `Player ${index + 1}`)}" aria-label="Batter ${index + 1} name">${player.substitutedFor ? `<small>Sub for ${player.substitutedForNumber ? `#${escapeHtml(player.substitutedForNumber)} ` : ''}${escapeHtml(player.substitutedFor)}${player.substitutionAt ? ` · ${escapeHtml(player.substitutionAt)}` : ''}</small>` : ''}</div>
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
      <input class="lineup-name" data-kind="pitcher" data-index="${index}" value="${escapeHtml(player.name)}" placeholder="Pitcher ${index + 1}" aria-label="Pitcher ${index + 1} name">
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
  buildLineupEditor(); $('lineupDialog').showModal();
});
$('teamTabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.team-tab');
  if (!tab || tab.dataset.team === editingTeam) return;
  readLineupEditor();
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
  lineupSnapshot = null;
  syncPlayersForHalf();
  $('lineupDialog').close();
}
$('closeLineup').addEventListener('click', cancelLineupChanges);
$('cancelLineup').addEventListener('click', cancelLineupChanges);
$('lineupDialog').addEventListener('input', updateLineupCount);
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
  readLineupEditor();
  propagateLineupChanges(lineupSnapshot);
  lineupSnapshot = null;
  renderLineupOptions(); save(); $('lineupDialog').close();
  syncPlayersForHalf();
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
  link.download = `lineups-${$('gameDate').value || 'game'}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  save(); showToast('Lineups PDF exported');
});

$('exportStatsPdf').addEventListener('click', () => {
  if (!state.pitches.length) return showToast('Record a pitch before exporting stats');
  const bytes = createStatsPdf(statsPdfData());
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([bytes], {type: 'application/pdf'}));
  link.download = `live-stats-${$('gameDate').value || 'game'}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast('Live stats PDF exported');
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

$('saveEditPitch').addEventListener('click', () => {
  if (editingPitchIndex < 0) return;
  const currentSituation = currentGameSituation();
  const result = $('editResult').value;
  const pitch = state.pitches[editingPitchIndex];
  const battingTeam = pitch.half === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const selectedPitcher = selectedLineupPlayer('editPitcherName', state.lineups[fieldingTeam].pitchers);
  const selectedBatter = selectedLineupPlayer('editBatterName', state.lineups[battingTeam].batters);
  const customPitcher = $('editPitcherName').value.startsWith('name:') ? $('editPitcherName').value.slice(5) : '';
  const customBatter = $('editBatterName').value.startsWith('name:') ? $('editBatterName').value.slice(5) : '';
  pitch.pitcher = selectedPitcher?.name || customPitcher || '—';
  pitch.pitcherId = selectedPitcher?.id || '';
  pitch.pitcherNumber = selectedPitcher?.number || '';
  pitch.batter = selectedBatter?.name || customBatter || '—';
  pitch.batterId = selectedBatter?.id || '';
  pitch.batterNumber = selectedBatter?.number || '';
  pitch.bats = selectedBatter?.bats || pitch.bats;
  pitch.type = $('editPitchType').value;
  pitch.group = pitchGroupForType(pitch.type);
  pitch.velocity = $('editVelocity').value;
  pitch.result = result;
  pitch.contactType = isInPlayResult(result) ? $('editContact').value : '';
  pitch.outLocation = ['In play - out', 'Double play'].includes(result) ? $('editOutPosition').value : '';
  pitch.errorLocation = result === 'Error' ? $('editErrorPosition').value : '';
  pitch.note = $('editNote').value.trim();
  pitch.location = editingPitchLocation ? {...editingPitchLocation} : null;
  replayGameState();
  restoreGameSituation(currentSituation);
  render(); save(); $('editPitchDialog').close(); showToast(`Pitch #${pitch.number} updated`);
});

$('recordButton').addEventListener('click', () => {
  const battingTeam = $('half').value === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const batterPlayer = state.lineups[battingTeam].batters.find(player => player.name === $('batter').value);
  const pitcherPlayer = state.lineups[fieldingTeam].pitchers.find(player => player.name === $('pitcher').value);
  const recordedAt = new Date();
  const recordedResult = state.result || (state.contactType ? 'In play' : 'Not recorded');
  const situationBeforePitch = currentGameSituation();
  if (resultWouldChangeInning(recordedResult) && !confirm('This pitch will make 3 outs and move to the next half inning. Continue?')) {
    showToast('Pitch not recorded');
    return;
  }
  const pitch = {
    number: state.pitches.length + 1, inning: $('inning').value, half: $('half').value,
    time: recordedAt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'}),
    recordedAt: recordedAt.toISOString(),
    count: `${state.balls}-${state.strikes}`, outs: state.outs,
    pitcher: $('pitcher').value.trim() || '—', pitcherId: pitcherPlayer?.id || '', pitcherNumber: pitcherPlayer?.number || '',
    batter: $('batter').value.trim() || '—', batterId: batterPlayer?.id || '', batterNumber: batterPlayer?.number || '', bats: $('bats').value,
    type: state.pitchType, group: state.pitchGroup, velocity: $('velocity').value || '',
    result: recordedResult, contactType: state.contactType || '', outLocation: state.outLocation || '', errorLocation: state.errorLocation || '',
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
  if (state.balls >= 4) { plateAppearanceEnded = true; label = 'Walk'; }
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

function pitchBattingTeam(pitch) {
  return pitch.half === 'Top' ? 'away' : 'home';
}

function pitchFieldingTeam(pitch) {
  return pitchBattingTeam(pitch) === 'away' ? 'home' : 'away';
}

function countBefore(pitch) {
  const [balls = 0, strikes = 0] = String(pitch.count || '0-0').split('-').map(Number);
  return {balls, strikes};
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
  const walk = result === 'Ball' && balls >= 3;
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
        key: `${team}:name:${player.substitutedFor}`,
        order: index + 1,
        name: player.substitutedFor,
        number: player.substitutedForNumber || '',
        position: player.substitutedForPosition || player.position || '',
        note: 'Started'
      });
      players.push({
        key: player.id || `${team}:lineup:${index}:sub`,
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
      order: index + 1,
      name: player.name || `Player ${index + 1}`,
      number: player.number || '',
      position: player.position || '',
      note: ''
    });
  });
  atBatsByInning.filter(item => item.battingTeam === team).forEach(({pitch}) => {
    const key = pitch.batterId || `${team}:name:${pitch.batter || 'unknown'}`;
    if (players.some(player => player.key === key || (pitch.batter && player.name === pitch.batter))) return;
    players.push({
      key,
      order: players.length + 1,
      name: pitch.batter || '—',
      number: pitch.batterNumber || '',
      position: '',
      note: 'Not in current lineup'
    });
  });
  return players;
}

function renderScorecardTeam(team, atBatsByInning, innings) {
  const players = scorecardPlayers(team, atBatsByInning);
  const cells = new Map();
  atBatsByInning.filter(item => item.battingTeam === team).forEach((item) => {
    const key = item.pitch.batterId || `${team}:name:${item.pitch.batter || 'unknown'}`;
    const player = players.find(entry => entry.key === key || (item.pitch.batter && entry.name === item.pitch.batter));
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
  atBatsByInning.filter(item => item.battingTeam === team).forEach((item) => {
    const key = item.pitch.batterId || `${team}:name:${item.pitch.batter || 'unknown'}`;
    const player = players.find(entry => entry.key === key || (item.pitch.batter && entry.name === item.pitch.batter));
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
  const headers = ['Pitch #','Date','Time','Home Team','Away Team','Inning','Half','Outs','Count','Pitcher #','Pitcher','Batter #','Batter','Bats','Pitch Type','Velocity','Result','Contact Type','Out Position','Error Position','Location','X %','Y %','Note'];
  const rows = state.pitches.map(p => [p.number,$('gameDate').value,p.time || '',$('homeTeam').value,$('awayTeam').value,p.inning,p.half,p.outs,p.count,p.pitcherNumber || '',p.pitcher,p.batterNumber || '',p.batter,p.bats,p.type,p.velocity,p.result,p.contactType || '',p.outLocation || '',p.errorLocation || '',locationName(p.location),p.location ? p.location.x.toFixed(1) : '',p.location ? p.location.y.toFixed(1) : '',p.note]);
  const csv = [headers,...rows].map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  link.download = `pitch-chart-${$('gameDate').value || 'game'}.csv`; link.click(); URL.revokeObjectURL(link.href);
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
}));
load(); renderLineupOptions(); render();
