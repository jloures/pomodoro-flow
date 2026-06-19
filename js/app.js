/**
 * Pomodoro Flow — Timer Logic + UI Controller
 *
 * Cycle model: settings.cycle is an ordered list of phases { type, minutes }
 * that run top-to-bottom then loop. "100% focus" = a single work phase.
 */
const App = (() => {
  // Phase types (drive colors + labels)
  const TYPE_META = {
    work:       { label: 'Focus' },
    shortBreak: { label: 'Short Break' },
    longBreak:  { label: 'Long Break' },
  };

  // Built-in cycle presets
  const PRESETS = {
    classic: { name: 'Classic (25 / 5 / 15)', phases: () => [
      { type: 'work', minutes: 25 }, { type: 'shortBreak', minutes: 5 },
      { type: 'work', minutes: 25 }, { type: 'shortBreak', minutes: 5 },
      { type: 'work', minutes: 25 }, { type: 'shortBreak', minutes: 5 },
      { type: 'work', minutes: 25 }, { type: 'longBreak', minutes: 15 },
    ] },
    deep: { name: 'Deep Work (50 / 10)', phases: () => [
      { type: 'work', minutes: 50 }, { type: 'shortBreak', minutes: 10 },
      { type: 'work', minutes: 50 }, { type: 'longBreak', minutes: 20 },
    ] },
    '52_17': { name: '52 / 17', phases: () => [
      { type: 'work', minutes: 52 }, { type: 'shortBreak', minutes: 17 },
    ] },
    focus100: { name: '100% On (no breaks)', phases: () => [
      { type: 'work', minutes: 25 },
    ] },
  };

  const DEFAULTS = {
    preset: 'classic',
    cycle: PRESETS.classic.phases(),
    sound: '',
    volume: 0.5,
    autoStart: true,
  };

  let settings = { ...DEFAULTS, cycle: DEFAULTS.cycle.map(p => ({ ...p })) };
  let state = {
    index: 0,           // current phase index in settings.cycle
    round: 1,           // how many times the cycle has looped (+1)
    timeLeft: 0,
    totalTime: 0,
    running: false,
    intervalId: null,
    endAt: 0,           // ms timestamp when current run ends (drift-free)
  };
  let settingsOpen = false;
  let previewTimeoutId = null;

  // DOM refs
  const $ = id => document.getElementById(id);
  const els = {};

  function cacheDom() {
    els.timeDisplay = $('time-display');
    els.modeLabel = $('mode-label');
    els.sessionCount = $('session-count');
    els.progressRing = $('progress-ring');
    els.btnStart = $('btn-start');
    els.btnReset = $('btn-reset');
    els.btnSkip = $('btn-skip');
    els.btnSettings = $('btn-settings');
    els.settingsPanel = $('settings-panel');
    els.settingsOverlay = $('settings-overlay');
    els.btnCloseSettings = $('btn-close-settings');
    els.selectPreset = $('select-preset');
    els.phaseList = $('phase-list');
    els.btnAddPhase = $('btn-add-phase');
    els.selectSound = $('select-sound');
    els.inputVolume = $('input-volume');
    els.volumeValue = $('volume-value');
    els.checkAutoStart = $('check-auto-start');
    els.body = document.body;
  }

  // --- Cycle helpers ---

  function clampMinutes(v) {
    v = parseInt(v, 10);
    if (!v || v < 1) return 1;
    if (v > 600) return 600;
    return v;
  }

  function currentPhase() {
    return settings.cycle[state.index] || settings.cycle[0];
  }

  function currentMode() {
    return currentPhase().type;
  }

  function phaseSeconds(p) {
    return clampMinutes(p.minutes) * 60;
  }

  // Move to phase i (wraps), load its duration. Does not start.
  function gotoPhase(i) {
    const n = settings.cycle.length;
    state.index = ((i % n) + n) % n;
    state.totalTime = phaseSeconds(currentPhase());
    state.timeLeft = state.totalTime;
  }

  // --- Timer ---

  function stopInterval() {
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.running = false;
  }

  function tick() {
    const remaining = Math.round((state.endAt - Date.now()) / 1000);
    if (remaining <= 0) {
      state.timeLeft = 0;
      renderTime();
      stopInterval();
      SoundEngine.stopAll();
      SoundEngine.chime();
      notifyUser();
      nextPhase();
      return;
    }
    state.timeLeft = remaining;
    renderTime();
  }

  function start() {
    if (state.running) return;
    if (state.timeLeft <= 0) gotoPhase(state.index); // safety: refill if drained
    SoundEngine.getCtx();       // unlock audio on gesture
    requestNotifications();
    state.running = true;
    state.endAt = Date.now() + state.timeLeft * 1000;
    state.intervalId = setInterval(tick, 250);
    if (settings.sound) SoundEngine.play(settings.sound);
    renderFull();
    saveSnapshot();
  }

  function pause() {
    if (state.running) {
      state.timeLeft = Math.max(0, Math.round((state.endAt - Date.now()) / 1000));
    }
    stopInterval();
    SoundEngine.stopAll();
    renderFull();
    saveSnapshot();
  }

  function toggle() {
    state.running ? pause() : start();
  }

  function reset() {
    stopInterval();
    SoundEngine.stopAll();
    gotoPhase(state.index);
    renderFull(false);
    saveSnapshot();
  }

  function skip() {
    nextPhase();
  }

  // Advance to the next phase in the sequence.
  function nextPhase() {
    stopInterval();
    SoundEngine.stopAll();
    const wrapped = state.index + 1 >= settings.cycle.length;
    gotoPhase(state.index + 1);
    if (wrapped) state.round++;
    renderFull(false);
    if (settings.autoStart) start();
    else saveSnapshot();
  }

  // Mode buttons: jump to the next phase of the given type (or current if it matches).
  function jumpToType(type) {
    const n = settings.cycle.length;
    let target = -1;
    for (let k = 0; k < n; k++) {
      const idx = (state.index + k) % n;
      if (settings.cycle[idx].type === type) { target = idx; break; }
    }
    if (target < 0) return;
    stopInterval();
    SoundEngine.stopAll();
    gotoPhase(target);
    renderFull(false);
    saveSnapshot();
  }

  // --- Render ---

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  // Hot path — called every tick. No body-class / DOM rebuild work.
  function renderTime(animate = true) {
    const t = formatTime(state.timeLeft);
    els.timeDisplay.textContent = t;
    document.title = `${state.running ? '▶ ' : ''}${t} — ${TYPE_META[currentMode()].label}`;
    setRing(animate);
    els.btnStart.textContent = state.running ? '⏸' : '▶';
    els.btnStart.setAttribute('aria-label', state.running ? 'Pause' : 'Start');
  }

  // Full render — phase/mode changes. animate=false jumps the ring instantly.
  function renderFull(animate = false) {
    renderTime(animate);
    const mode = currentMode();
    els.modeLabel.textContent = TYPE_META[mode].label;
    els.sessionCount.textContent = `Round ${state.round} · Phase ${state.index + 1}/${settings.cycle.length}`;

    document.querySelectorAll('.mode-btn').forEach(btn => {
      const t = btn.dataset.mode;
      const present = settings.cycle.some(p => p.type === t);
      btn.disabled = !present;
      btn.classList.toggle('active', t === mode);
    });

    updateBodyClass();
  }

  function setRing(animate) {
    const circ = 2 * Math.PI * 140;
    const progress = state.totalTime > 0 ? state.timeLeft / state.totalTime : 1;
    const offset = circ * (1 - Math.min(1, Math.max(0, progress)));
    const r = els.progressRing;
    r.style.strokeDasharray = circ;
    if (animate) {
      r.style.strokeDashoffset = offset;
    } else {
      // Instant jump — disable the CSS transition, set, force reflow, restore.
      r.style.transition = 'none';
      r.style.strokeDashoffset = offset;
      r.getBoundingClientRect();
      r.style.transition = '';
    }
  }

  function updateBodyClass() {
    const cls = `mode-${currentMode()}${settingsOpen ? ' settings-open' : ''}`;
    if (els.body.className !== cls) els.body.className = cls;
  }

  // --- Notifications ---

  function notifyUser() {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Pomodoro Flow', {
        body: `${TYPE_META[currentMode()].label} complete!`,
        icon: 'favicon.svg',
      });
    }
  }

  function requestNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // --- Settings panel open/close ---

  function openSettings() {
    settingsOpen = true;
    els.settingsPanel.classList.add('open');
    els.settingsOverlay.classList.add('open');
    updateBodyClass();
  }

  function closeSettings() {
    settingsOpen = false;
    els.settingsPanel.classList.remove('open');
    els.settingsOverlay.classList.remove('open');
    updateBodyClass();
  }

  // --- Persistence ---

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('pomodoroFlow'));
      if (saved) Object.assign(settings, saved);
    } catch {}
    // Validate/normalize cycle
    if (!Array.isArray(settings.cycle) || settings.cycle.length === 0) {
      settings.cycle = PRESETS.classic.phases();
    }
    settings.cycle = settings.cycle
      .filter(p => p && TYPE_META[p.type])
      .map(p => ({ type: p.type, minutes: clampMinutes(p.minutes) }));
    if (settings.cycle.length === 0) settings.cycle = PRESETS.classic.phases();
  }

  function saveSettings() {
    localStorage.setItem('pomodoroFlow', JSON.stringify(settings));
  }

  function saveSnapshot() {
    localStorage.setItem('pomodoroFlowState', JSON.stringify({
      index: state.index, round: state.round, timeLeft: state.timeLeft,
    }));
  }

  function loadSnapshot() {
    try {
      const s = JSON.parse(localStorage.getItem('pomodoroFlowState'));
      if (s && typeof s.index === 'number' && s.index >= 0 && s.index < settings.cycle.length) {
        state.index = s.index;
        state.round = s.round || 1;
        gotoPhase(state.index); // refills timeLeft to full
        if (typeof s.timeLeft === 'number' && s.timeLeft > 0 && s.timeLeft <= state.totalTime) {
          state.timeLeft = s.timeLeft; // resume paused at saved point
        }
      }
    } catch {}
  }

  // --- Cycle builder UI ---

  function matchPreset() {
    const cur = JSON.stringify(settings.cycle);
    for (const [k, pr] of Object.entries(PRESETS)) {
      if (JSON.stringify(pr.phases()) === cur) return k;
    }
    return null;
  }

  function populatePresetUI() {
    els.selectPreset.innerHTML = '';
    Object.entries(PRESETS).forEach(([k, pr]) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = pr.name;
      els.selectPreset.appendChild(o);
    });
    const custom = document.createElement('option');
    custom.value = 'custom'; custom.textContent = 'Custom';
    els.selectPreset.appendChild(custom);
    els.selectPreset.value = matchPreset() || 'custom';
  }

  function renderPhaseList() {
    els.phaseList.innerHTML = '';
    settings.cycle.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'phase-row';

      const sel = document.createElement('select');
      sel.className = 'phase-type';
      Object.entries(TYPE_META).forEach(([t, m]) => {
        const o = document.createElement('option');
        o.value = t; o.textContent = m.label;
        if (t === p.type) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => { settings.cycle[i].type = sel.value; onCycleEdited(); });

      const num = document.createElement('input');
      num.type = 'number'; num.min = 1; num.max = 600; num.value = p.minutes;
      num.className = 'phase-min';
      num.addEventListener('change', () => {
        settings.cycle[i].minutes = clampMinutes(num.value);
        num.value = settings.cycle[i].minutes;
        onCycleEdited();
      });

      const unit = document.createElement('span');
      unit.className = 'phase-unit'; unit.textContent = 'min';

      const del = document.createElement('button');
      del.className = 'phase-del'; del.innerHTML = '&#10005;';
      del.setAttribute('aria-label', 'Remove phase');
      del.disabled = settings.cycle.length <= 1;
      del.addEventListener('click', () => {
        if (settings.cycle.length <= 1) return;
        settings.cycle.splice(i, 1);
        onCycleEdited();
      });

      row.append(sel, num, unit, del);
      els.phaseList.appendChild(row);
    });
  }

  // Called when the user edits any phase or adds/removes one.
  function onCycleEdited() {
    els.selectPreset.value = matchPreset() || 'custom';
    saveSettings();
    renderPhaseList();
    // Keep index valid; refresh current phase if idle.
    if (state.index >= settings.cycle.length) state.index = settings.cycle.length - 1;
    if (!state.running) gotoPhase(state.index);
    renderFull(false);
  }

  function applyPreset(key) {
    if (key === 'custom') return;
    settings.preset = key;
    settings.cycle = PRESETS[key].phases();
    saveSettings();
    renderPhaseList();
    state.round = 1;
    if (!state.running) gotoPhase(0);
    else if (state.index >= settings.cycle.length) state.index = settings.cycle.length - 1;
    renderFull(false);
  }

  function populateSettingsUI() {
    els.selectPreset.value = matchPreset() || 'custom';
    els.inputVolume.value = settings.volume;
    els.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
    els.checkAutoStart.checked = settings.autoStart;

    els.selectSound.innerHTML = '<option value="">None</option>';
    Object.entries(SoundEngine.SOUNDS).forEach(([key, s]) => {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = s.name;
      if (key === settings.sound) opt.selected = true;
      els.selectSound.appendChild(opt);
    });

    // Defer ctx creation: setVolume only stores the value until audio unlocks.
    SoundEngine.setVolume(settings.volume);
  }

  // --- Events ---

  function bindEvents() {
    els.btnStart.addEventListener('click', toggle);
    els.btnReset.addEventListener('click', reset);
    els.btnSkip.addEventListener('click', skip);
    els.btnSettings.addEventListener('click', openSettings);
    els.btnCloseSettings.addEventListener('click', closeSettings);
    els.settingsOverlay.addEventListener('click', closeSettings);

    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => jumpToType(btn.dataset.mode));
    });

    els.selectPreset.addEventListener('change', () => applyPreset(els.selectPreset.value));
    els.btnAddPhase.addEventListener('click', () => {
      settings.cycle.push({ type: 'work', minutes: 25 });
      onCycleEdited();
    });

    els.checkAutoStart.addEventListener('change', () => {
      settings.autoStart = els.checkAutoStart.checked;
      saveSettings();
    });

    els.inputVolume.addEventListener('input', () => {
      const v = parseFloat(els.inputVolume.value);
      els.volumeValue.textContent = `${Math.round(v * 100)}%`;
      settings.volume = v;
      SoundEngine.setVolume(v);
      saveSettings();
    });

    // Sound change — live swap if running, short preview otherwise
    els.selectSound.addEventListener('change', () => {
      settings.sound = els.selectSound.value;
      saveSettings();
      if (previewTimeoutId) { clearTimeout(previewTimeoutId); previewTimeoutId = null; }
      if (state.running) {
        SoundEngine.play(settings.sound); // empty key → stopAll only
      } else if (settings.sound) {
        SoundEngine.play(settings.sound);
        previewTimeoutId = setTimeout(() => {
          previewTimeoutId = null;
          if (!state.running) SoundEngine.stopAll();
        }, 2000);
      } else {
        SoundEngine.stopAll();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && settingsOpen) { closeSettings(); return; }
      if (settingsOpen) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'r' || e.key === 'R') reset();
      else if (e.key === 's' || e.key === 'S') skip();
    });
  }

  // --- Init ---

  function init() {
    cacheDom();
    loadSettings();
    populatePresetUI();
    gotoPhase(0);
    loadSnapshot();
    populateSettingsUI();
    renderPhaseList();
    bindEvents();
    renderFull(false);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { start, pause, toggle, reset, skip, jumpToType };
})();
