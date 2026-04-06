/**
 * Pomodoro Flow — Timer Logic + UI Controller
 */
const App = (() => {
  // Defaults
  const DEFAULTS = {
    work: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60,
    sessionsBeforeLong: 4,
    sound: '',
    volume: 0.5,
    autoStart: true,
  };

  let settings = { ...DEFAULTS };
  let state = {
    mode: 'work',           // work | shortBreak | longBreak
    timeLeft: settings.work,
    totalTime: settings.work,
    running: false,
    session: 1,
    intervalId: null,
  };

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
    els.inputWork = $('input-work');
    els.inputShort = $('input-short');
    els.inputLong = $('input-long');
    els.inputSessions = $('input-sessions');
    els.selectSound = $('select-sound');
    els.inputVolume = $('input-volume');
    els.volumeValue = $('volume-value');
    els.checkAutoStart = $('check-auto-start');
    els.body = document.body;
  }

  // --- Timer ---

  function tick() {
    if (state.timeLeft <= 0) {
      clearInterval(state.intervalId);
      state.running = false;
      SoundEngine.chime();
      notifyUser();
      nextMode();
      return;
    }
    state.timeLeft--;
    render();
  }

  function start() {
    if (state.running) return;
    SoundEngine.getCtx(); // unlock audio
    state.running = true;
    state.intervalId = setInterval(tick, 1000);
    if (settings.sound) SoundEngine.play(settings.sound);
    render();
  }

  function pause() {
    clearInterval(state.intervalId);
    state.running = false;
    SoundEngine.stopAll();
    render();
  }

  function toggle() {
    state.running ? pause() : start();
  }

  function reset() {
    pause();
    state.timeLeft = state.totalTime;
    render();
  }

  function skip() {
    pause();
    nextMode();
  }

  function nextMode() {
    if (state.mode === 'work') {
      if (state.session % settings.sessionsBeforeLong === 0) {
        setMode('longBreak');
      } else {
        setMode('shortBreak');
      }
    } else {
      if (state.mode === 'longBreak') state.session = 0;
      state.session++;
      setMode('work');
    }
    if (settings.autoStart) start();
    else render();
  }

  function setMode(mode) {
    state.mode = mode;
    const durations = {
      work: settings.work,
      shortBreak: settings.shortBreak,
      longBreak: settings.longBreak,
    };
    state.totalTime = durations[mode];
    state.timeLeft = durations[mode];
    state.running = false;
    clearInterval(state.intervalId);
    SoundEngine.stopAll();
    updateBodyClass();
  }

  function selectMode(mode) {
    pause();
    if (mode === 'work') state.session = Math.max(1, state.session);
    setMode(mode);
    render();
  }

  // --- Render ---

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function render() {
    els.timeDisplay.textContent = formatTime(state.timeLeft);
    document.title = `${formatTime(state.timeLeft)} — Pomodoro Flow`;

    const modeNames = { work: 'Focus', shortBreak: 'Short Break', longBreak: 'Long Break' };
    els.modeLabel.textContent = modeNames[state.mode];
    els.sessionCount.textContent = `Session ${state.session}`;

    // Progress ring
    const circumference = 2 * Math.PI * 140;
    const progress = state.totalTime > 0 ? state.timeLeft / state.totalTime : 1;
    const offset = circumference * (1 - progress);
    els.progressRing.style.strokeDasharray = circumference;
    els.progressRing.style.strokeDashoffset = offset;

    // Button state
    els.btnStart.textContent = state.running ? '⏸' : '▶';
    els.btnStart.setAttribute('aria-label', state.running ? 'Pause' : 'Start');

    // Mode selector
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.mode);
    });

    updateBodyClass();
  }

  function updateBodyClass() {
    els.body.className = `mode-${state.mode}`;
    if (els.settingsPanel.classList.contains('open')) {
      els.body.classList.add('settings-open');
    }
  }

  // --- Notifications ---

  function notifyUser() {
    if ('Notification' in window && Notification.permission === 'granted') {
      const modeNames = { work: 'Focus', shortBreak: 'Short Break', longBreak: 'Long Break' };
      new Notification('Pomodoro Flow', {
        body: `${modeNames[state.mode]} session complete!`,
        icon: 'favicon.svg',
      });
    }
  }

  function requestNotifications() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // --- Settings ---

  function openSettings() {
    els.settingsPanel.classList.add('open');
    els.settingsOverlay.classList.add('open');
    els.body.classList.add('settings-open');
  }

  function closeSettings() {
    els.settingsPanel.classList.remove('open');
    els.settingsOverlay.classList.remove('open');
    els.body.classList.remove('settings-open');
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('pomodoroFlow'));
      if (saved) Object.assign(settings, saved);
    } catch {}
  }

  function saveSettings() {
    localStorage.setItem('pomodoroFlow', JSON.stringify(settings));
  }

  function applySettingsFromUI() {
    settings.work = parseInt(els.inputWork.value) * 60 || DEFAULTS.work;
    settings.shortBreak = parseInt(els.inputShort.value) * 60 || DEFAULTS.shortBreak;
    settings.longBreak = parseInt(els.inputLong.value) * 60 || DEFAULTS.longBreak;
    settings.sessionsBeforeLong = parseInt(els.inputSessions.value) || DEFAULTS.sessionsBeforeLong;
    settings.sound = els.selectSound.value;
    settings.volume = parseFloat(els.inputVolume.value);
    settings.autoStart = els.checkAutoStart.checked;

    SoundEngine.setVolume(settings.volume);
    saveSettings();

    // Reset current timer to new duration if not running
    if (!state.running) {
      const durations = { work: settings.work, shortBreak: settings.shortBreak, longBreak: settings.longBreak };
      state.totalTime = durations[state.mode];
      state.timeLeft = durations[state.mode];
      render();
    }
  }

  function populateSettingsUI() {
    els.inputWork.value = settings.work / 60;
    els.inputShort.value = settings.shortBreak / 60;
    els.inputLong.value = settings.longBreak / 60;
    els.inputSessions.value = settings.sessionsBeforeLong;
    els.inputVolume.value = settings.volume;
    els.volumeValue.textContent = `${Math.round(settings.volume * 100)}%`;
    els.checkAutoStart.checked = settings.autoStart;

    // Populate sound select
    els.selectSound.innerHTML = '<option value="">None</option>';
    Object.entries(SoundEngine.SOUNDS).forEach(([key, s]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = s.name;
      if (key === settings.sound) opt.selected = true;
      els.selectSound.appendChild(opt);
    });

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

    // Mode selectors
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => selectMode(btn.dataset.mode));
    });

    // Settings inputs — live update
    [els.inputWork, els.inputShort, els.inputLong, els.inputSessions, els.selectSound, els.checkAutoStart].forEach(el => {
      el.addEventListener('change', applySettingsFromUI);
    });

    els.inputVolume.addEventListener('input', () => {
      els.volumeValue.textContent = `${Math.round(els.inputVolume.value * 100)}%`;
      settings.volume = parseFloat(els.inputVolume.value);
      SoundEngine.setVolume(settings.volume);
      saveSettings();
    });

    // Sound preview on change
    els.selectSound.addEventListener('change', () => {
      applySettingsFromUI();
      if (settings.sound && !state.running) {
        SoundEngine.play(settings.sound);
        setTimeout(() => { if (!state.running) SoundEngine.stopAll(); }, 2000);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      if (e.key === 'r' || e.key === 'R') reset();
      if (e.key === 's' || e.key === 'S') skip();
    });
  }

  // --- Init ---

  function init() {
    cacheDom();
    loadSettings();
    state.totalTime = settings.work;
    state.timeLeft = settings.work;
    populateSettingsUI();
    bindEvents();
    render();
    requestNotifications();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { start, pause, toggle, reset, skip, selectMode };
})();
