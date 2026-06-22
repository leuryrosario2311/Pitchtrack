const STORAGE_KEY = 'pitchtrack-game-v1';
const $ = (id) => document.getElementById(id);
const createLineup = () => ({
  batters: Array.from({length: 9}, () => ({name: '', number: '', position: '', bats: 'R'})),
  pitchers: Array.from({length: 6}, () => ({name: '', number: '', throws: 'R'}))
});

const state = {
  pitches: [], location: null, pitchType: 'Four-seam', pitchGroup: 'fastball', result: null,
  balls: 0, strikes: 0, outs: 0,
  lineups: {home: createLineup(), away: createLineup()},
  battingIndexes: {home: 0, away: 0},
  selectedPitchers: {home: '', away: ''}
};
let editingTeam = 'away';

const fields = ['opponent', 'gameDate', 'inning', 'half', 'pitcher', 'batter', 'bats'];
const today = new Date();
$('gameDate').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
for (let i = 1; i <= 12; i++) $('inning').add(new Option(i, i));
for (let mph = 110; mph >= 30; mph--) $('velocity').add(new Option(`${mph} mph`, mph));

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
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) $('installButton').hidden = true;
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

function buildLineupEditor() {
  const lineup = state.lineups[editingTeam];
  $('battingLineup').innerHTML = lineup.batters.map((player, index) => `
    <div class="lineup-row batting">
      <span class="order-number">${index + 1}</span>
      <input class="lineup-name" data-kind="batter" data-index="${index}" value="${escapeHtml(player.name)}" placeholder="Player ${index + 1}" aria-label="Batter ${index + 1} name">
      <input class="lineup-number" data-index="${index}" value="${escapeHtml(player.number || '')}" placeholder="#" maxlength="3" inputmode="numeric" aria-label="Batter ${index + 1} jersey number">
      <input class="lineup-position" data-index="${index}" value="${escapeHtml(player.position)}" placeholder="Pos" maxlength="3" aria-label="Batter ${index + 1} position">
      <select class="lineup-bats" data-index="${index}" aria-label="Batter ${index + 1} bats"><option ${player.bats === 'R' ? 'selected' : ''}>R</option><option ${player.bats === 'L' ? 'selected' : ''}>L</option><option ${player.bats === 'S' ? 'selected' : ''}>S</option></select>
      <button class="remove-player" data-kind="batter" data-index="${index}" type="button" title="Remove ${escapeHtml(player.name || `Player ${index + 1}`)}" aria-label="Remove batter ${index + 1}">×</button>
    </div>`).join('');
  $('pitchingStaff').innerHTML = lineup.pitchers.map((player, index) => `
    <div class="lineup-row pitching">
      <span class="order-number">${index + 1}</span>
      <input class="lineup-name" data-kind="pitcher" data-index="${index}" value="${escapeHtml(player.name)}" placeholder="Pitcher ${index + 1}" aria-label="Pitcher ${index + 1} name">
      <input class="lineup-number" data-index="${index}" value="${escapeHtml(player.number || '')}" placeholder="#" maxlength="3" inputmode="numeric" aria-label="Pitcher ${index + 1} jersey number">
      <select class="lineup-throws" data-index="${index}" aria-label="Pitcher ${index + 1} throws"><option ${player.throws === 'R' ? 'selected' : ''}>R</option><option ${player.throws === 'L' ? 'selected' : ''}>L</option></select>
      <button class="remove-player" data-kind="pitcher" data-index="${index}" type="button" title="Remove ${escapeHtml(player.name || `Pitcher ${index + 1}`)}" aria-label="Remove pitcher ${index + 1}">×</button>
    </div>`).join('');
  updateLineupCount();
}

function readLineupEditor() {
  state.lineups[editingTeam].batters = [...$('battingLineup').querySelectorAll('.lineup-row')].map((row) => ({
    name: row.querySelector('.lineup-name').value.trim(), number: row.querySelector('.lineup-number').value.trim(), position: row.querySelector('.lineup-position').value.trim().toUpperCase(), bats: row.querySelector('.lineup-bats').value
  }));
  state.lineups[editingTeam].pitchers = [...$('pitchingStaff').querySelectorAll('.lineup-row')].map((row) => ({
    name: row.querySelector('.lineup-name').value.trim(), number: row.querySelector('.lineup-number').value.trim(), throws: row.querySelector('.lineup-throws').value
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

function updateLineupCount() {
  const names = $('lineupDialog').querySelectorAll('.lineup-name');
  const count = [...names].filter(input => input.value.trim()).length;
  const teamName = `${capitalize(editingTeam)} Team`;
  $('lineupCount').textContent = count ? `${teamName} · ${count} player${count === 1 ? '' : 's'} ready` : `${teamName} · No players added`;
}

$('lineupButton').addEventListener('click', () => { buildLineupEditor(); $('lineupDialog').showModal(); });
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
$('closeLineup').addEventListener('click', () => $('lineupDialog').close());
$('cancelLineup').addEventListener('click', () => $('lineupDialog').close());
$('lineupDialog').addEventListener('input', updateLineupCount);
$('lineupDialog').addEventListener('click', (event) => { if (event.target === $('lineupDialog')) $('lineupDialog').close(); });
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
  state.lineups[editingTeam].batters.push({name: '', number: '', position: '', bats: 'R'});
  buildLineupEditor();
  $('battingLineup').querySelector('.lineup-row:last-child .lineup-name').focus();
});
$('addPitcherRow').addEventListener('click', () => {
  readLineupEditor();
  state.lineups[editingTeam].pitchers.push({name: '', number: '', throws: 'R'});
  buildLineupEditor();
  $('pitchingStaff').querySelector('.lineup-row:last-child .lineup-name').focus();
});
$('lineupDialog').addEventListener('click', (event) => {
  const button = event.target.closest('.remove-player');
  if (!button) return;
  readLineupEditor();
  const collection = button.dataset.kind === 'batter' ? state.lineups[editingTeam].batters : state.lineups[editingTeam].pitchers;
  collection.splice(Number(button.dataset.index), 1);
  buildLineupEditor();
});
$('saveLineup').addEventListener('click', () => {
  readLineupEditor(); renderLineupOptions(); save(); $('lineupDialog').close();
  syncPlayersForHalf();
  save(); showToast('Lineups saved');
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
function openPlayerEditor(kind) {
  const select = $(kind);
  if (!select.value) { showToast(`Choose a ${kind} first`); return; }
  editingPlayerKind = kind;
  $('renameTitle').textContent = `Rename ${kind}`;
  $('renameInput').value = select.value;
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
$('saveRename').addEventListener('click', () => {
  const newName = $('renameInput').value.trim();
  if (!newName || !editingPlayerKind) return;
  const oldName = $(editingPlayerKind).value;
  const battingTeam = $('half').value === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const team = editingPlayerKind === 'batter' ? battingTeam : fieldingTeam;
  const collection = editingPlayerKind === 'batter' ? state.lineups[team].batters : state.lineups[team].pitchers;
  const player = collection.find(p => p.name === oldName);
  if (player) player.name = newName;
  if (editingPlayerKind === 'pitcher' && state.selectedPitchers[team] === oldName) state.selectedPitchers[team] = newName;
  state.pitches.forEach(pitch => { if (pitch[editingPlayerKind] === oldName) pitch[editingPlayerKind] = newName; });
  renderLineupOptions();
  $(editingPlayerKind).value = newName;
  render(); save(); $('renameDialog').close(); showToast(`${oldName} renamed to ${newName}`);
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
choose('results', 'button', (button) => { state.result = button.dataset.value; updateRecordButton(); });

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
  const horizontal = location.x < 25 ? 'far left' : location.x > 75 ? 'far right' : location.x < 41.7 ? 'left' : location.x > 58.3 ? 'right' : 'middle';
  const vertical = location.y < 14 ? 'high' : location.y > 78 ? 'low' : location.y < 35.3 ? 'upper' : location.y > 56.7 ? 'lower' : 'middle';
  return `${vertical} ${horizontal}`;
}

function updateRecordButton() { $('recordButton').disabled = !(state.location && state.result); }

$('recordButton').addEventListener('click', () => {
  const battingTeam = $('half').value === 'Top' ? 'away' : 'home';
  const fieldingTeam = battingTeam === 'away' ? 'home' : 'away';
  const batterPlayer = state.lineups[battingTeam].batters.find(player => player.name === $('batter').value);
  const pitcherPlayer = state.lineups[fieldingTeam].pitchers.find(player => player.name === $('pitcher').value);
  const pitch = {
    number: state.pitches.length + 1, inning: $('inning').value, half: $('half').value,
    count: `${state.balls}-${state.strikes}`, outs: state.outs,
    pitcher: $('pitcher').value.trim() || '—', pitcherNumber: pitcherPlayer?.number || '',
    batter: $('batter').value.trim() || '—', batterNumber: batterPlayer?.number || '', bats: $('bats').value,
    type: state.pitchType, group: state.pitchGroup, velocity: $('velocity').value || '',
    result: state.result, note: $('note').value.trim(), location: {...state.location}
  };
  state.pitches.push(pitch);
  const outcome = advanceGame(pitch.result);
  if (outcome.plateAppearanceEnded) moveToNextBatter(false, battingTeam);
  if (outcome.inningChanged) syncPlayersForHalf();
  state.location = null; state.result = null;
  $('crosshair').classList.remove('visible');
  $('results').querySelectorAll('button').forEach((button) => button.classList.remove('selected'));
  $('note').value = '';
  $('zoneHelp').textContent = 'Select a location to enable “Record pitch”.';
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
  if (state.strikes >= 3 || result === 'Strikeout') { plateAppearanceEnded = true; outRecorded = true; label = 'Strikeout'; }
  if (result === 'In play - out') { plateAppearanceEnded = true; outRecorded = true; label = 'Out in play'; }
  if (result === 'In play - hit') { plateAppearanceEnded = true; label = 'Hit'; }
  if (outRecorded) inningChanged = recordOut();
  if (plateAppearanceEnded) { state.balls = 0; state.strikes = 0; }
  return {plateAppearanceEnded, outRecorded, inningChanged, label};
}

function recordOut() {
  state.outs++;
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

function render() {
  $('ballCount').textContent = state.balls; $('strikeCount').textContent = state.strikes;
  $('pitchNumber').textContent = `#${state.pitches.length + 1}`;
  $('emptyState').hidden = state.pitches.length > 0;
  $('undoButton').disabled = $('resetButton').disabled = state.pitches.length === 0;
  $('pitchMarkers').innerHTML = state.pitches.map((pitch) => `<span class="pitch-marker ${pitch.group}" style="left:${pitch.location.x}%;top:${pitch.location.y}%" title="#${pitch.number} ${escapeHtml(pitch.type)} — ${escapeHtml(pitch.result)}">${pitch.number}</span>`).join('');
  $('pitchLog').innerHTML = state.pitches.slice().reverse().map((pitch) => `<tr><td><b>${pitch.number}</b></td><td>${pitch.half[0]} ${pitch.inning}</td><td>${pitch.count}</td><td>${pitch.pitcherNumber ? `#${escapeHtml(pitch.pitcherNumber)} ` : ''}${escapeHtml(pitch.pitcher)}</td><td>${pitch.batterNumber ? `#${escapeHtml(pitch.batterNumber)} ` : ''}${escapeHtml(pitch.batter)}</td><td>${escapeHtml(pitch.type)}</td><td>${pitch.velocity ? `${escapeHtml(pitch.velocity)} mph` : '—'}</td><td>${escapeHtml(pitch.result)}</td><td>${locationName(pitch.location)}</td></tr>`).join('');
  const velocities = state.pitches.map(p => Number(p.velocity)).filter(Boolean);
  const avg = velocities.length ? Math.round(velocities.reduce((a,b) => a+b, 0) / velocities.length) : '—';
  const strikes = state.pitches.filter(p => ['Called strike','Swinging strike','Foul','Strikeout','In play - out','In play - hit'].includes(p.result)).length;
  const rate = state.pitches.length ? Math.round(strikes / state.pitches.length * 100) : 0;
  $('summary').innerHTML = `<span><b>${state.pitches.length}</b> pitches</span><span><b>${avg}</b> avg mph</span><span><b>${rate}%</b> strikes</span>`;
}

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
  if (!state.pitches.length || !confirm('Reset this game and remove every recorded pitch?')) return;
  state.pitches = []; state.balls = 0; state.strikes = 0; state.outs = 0; updateOutButtons(); render(); save(); showToast('Game reset');
});

$('exportButton').addEventListener('click', () => {
  if (!state.pitches.length) return showToast('Record a pitch before exporting');
  const headers = ['Pitch #','Date','Opponent','Inning','Half','Outs','Count','Pitcher #','Pitcher','Batter #','Batter','Bats','Pitch Type','Velocity','Result','Location','X %','Y %','Note'];
  const rows = state.pitches.map(p => [p.number,$('gameDate').value,$('opponent').value,p.inning,p.half,p.outs,p.count,p.pitcherNumber || '',p.pitcher,p.batterNumber || '',p.batter,p.bats,p.type,p.velocity,p.result,locationName(p.location),p.location.x.toFixed(1),p.location.y.toFixed(1),p.note]);
  const csv = [headers,...rows].map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  link.download = `pitch-chart-${$('gameDate').value || 'game'}.csv`; link.click(); URL.revokeObjectURL(link.href);
  showToast('Pitch chart exported');
});

function escapeHtml(value) { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
function showToast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => $('toast').classList.remove('show'), 2200); }

function save() {
  const data = { pitches: state.pitches, balls: state.balls, strikes: state.strikes, outs: state.outs, lineups: state.lineups, battingIndexes: state.battingIndexes, selectedPitchers: state.selectedPitchers, fields: Object.fromEntries(fields.map(id => [id, $(id).value])) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (!data) return;
    state.pitches = data.pitches || []; state.balls = data.balls || 0; state.strikes = data.strikes || 0; state.outs = data.outs || 0;
    if (data.lineups) state.lineups = data.lineups;
    else if (data.lineup) state.lineups.away = data.lineup;
    if (data.battingIndexes) state.battingIndexes = data.battingIndexes;
    if (data.selectedPitchers) state.selectedPitchers = data.selectedPitchers;
    renderLineupOptions();
    fields.forEach(id => { if (data.fields?.[id] !== undefined) $(id).value = data.fields[id]; });
    updateOutButtons();
  } catch (_) { localStorage.removeItem(STORAGE_KEY); }
}
fields.forEach(id => $(id).addEventListener('change', save));
load(); renderLineupOptions(); render();
