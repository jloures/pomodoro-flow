/**
 * Pomodoro Flow — Web Audio API Sound Engine
 */
const SoundEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let activeNodes = [];

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setVolume(v) {
    getCtx();
    masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  }

  function stopAll() {
    activeNodes.forEach(n => {
      try { n.stop ? n.stop() : n.disconnect(); } catch {}
    });
    activeNodes = [];
  }

  function createNoiseBuffer(type) {
    const ac = getCtx();
    const sr = ac.sampleRate;
    const len = sr * 2;
    const buf = ac.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
    return buf;
  }

  function loopNoise(buffer) {
    const ac = getCtx();
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    activeNodes.push(src);
    return src;
  }

  // --- Sound generators ---

  function whiteNoise() {
    const src = loopNoise(createNoiseBuffer('white'));
    src.connect(masterGain);
    src.start();
  }

  function pinkNoise() {
    const src = loopNoise(createNoiseBuffer('pink'));
    src.connect(masterGain);
    src.start();
  }

  function brownNoise() {
    const src = loopNoise(createNoiseBuffer('brown'));
    src.connect(masterGain);
    src.start();
  }

  function rain() {
    const ac = getCtx();
    const src = loopNoise(createNoiseBuffer('brown'));

    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8000;

    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.15;

    const envGain = ac.createGain();
    envGain.gain.value = 0.85;

    lfo.connect(lfoGain);
    lfoGain.connect(envGain.gain);
    lfo.start();
    activeNodes.push(lfo);

    src.connect(hp);
    hp.connect(lp);
    lp.connect(envGain);
    envGain.connect(masterGain);
    src.start();
  }

  function oceanWaves() {
    const ac = getCtx();
    const src = loopNoise(createNoiseBuffer('brown'));

    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.5;

    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 0.4;

    const envGain = ac.createGain();
    envGain.gain.value = 0.6;

    lfo.connect(lfoGain);
    lfoGain.connect(envGain.gain);
    lfo.start();
    activeNodes.push(lfo);

    // Second layer — high wash
    const src2 = loopNoise(createNoiseBuffer('white'));
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const washGain = ac.createGain();
    washGain.gain.value = 0.08;

    const lfo2 = ac.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.value = 0.08;
    const lfo2Gain = ac.createGain();
    lfo2Gain.gain.value = 0.06;
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(washGain.gain);
    lfo2.start();
    activeNodes.push(lfo2);

    src2.connect(hp);
    hp.connect(washGain);
    washGain.connect(masterGain);
    src2.start();

    src.connect(bp);
    bp.connect(envGain);
    envGain.connect(masterGain);
    src.start();
  }

  function binauralFocus() {
    const ac = getCtx();
    const baseFreq = 200;
    const beatFreq = 10; // alpha waves

    const oscL = ac.createOscillator();
    oscL.type = 'sine';
    oscL.frequency.value = baseFreq;

    const oscR = ac.createOscillator();
    oscR.type = 'sine';
    oscR.frequency.value = baseFreq + beatFreq;

    const merger = ac.createChannelMerger(2);
    const gain = ac.createGain();
    gain.gain.value = 0.6;

    oscL.connect(merger, 0, 0);
    oscR.connect(merger, 0, 1);
    merger.connect(gain);
    gain.connect(masterGain);

    oscL.start();
    oscR.start();
    activeNodes.push(oscL, oscR);
  }

  function campfire() {
    const ac = getCtx();

    // Base crackle layer
    const src = loopNoise(createNoiseBuffer('brown'));
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 2;

    const baseGain = ac.createGain();
    baseGain.gain.value = 0.7;

    src.connect(bp);
    bp.connect(baseGain);
    baseGain.connect(masterGain);
    src.start();

    // Crackle pops — random amplitude modulation
    const crackle = loopNoise(createNoiseBuffer('white'));
    const crackleHP = ac.createBiquadFilter();
    crackleHP.type = 'highpass';
    crackleHP.frequency.value = 2000;

    const crackleGain = ac.createGain();
    crackleGain.gain.value = 0.15;

    // Modulate crackle volume
    const modOsc = ac.createOscillator();
    modOsc.type = 'sawtooth';
    modOsc.frequency.value = 3;
    const modGain = ac.createGain();
    modGain.gain.value = 0.12;
    modOsc.connect(modGain);
    modGain.connect(crackleGain.gain);
    modOsc.start();
    activeNodes.push(modOsc);

    crackle.connect(crackleHP);
    crackleHP.connect(crackleGain);
    crackleGain.connect(masterGain);
    crackle.start();
  }

  function fan() {
    const ac = getCtx();
    const src = loopNoise(createNoiseBuffer('pink'));

    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;

    const hum = ac.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 60;
    const humGain = ac.createGain();
    humGain.gain.value = 0.05;
    hum.connect(humGain);
    humGain.connect(masterGain);
    hum.start();
    activeNodes.push(hum);

    src.connect(lp);
    lp.connect(masterGain);
    src.start();
  }

  // --- Notification chime ---

  function chime() {
    const ac = getCtx();
    const now = ac.currentTime;

    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
    frequencies.forEach((freq, i) => {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = ac.createGain();
      const start = now + i * 0.15;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.3, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.2);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(start);
      osc.stop(start + 1.3);
    });
  }

  const SOUNDS = {
    white:    { name: 'White Noise',    fn: whiteNoise },
    pink:     { name: 'Pink Noise',     fn: pinkNoise },
    brown:    { name: 'Brown Noise',    fn: brownNoise },
    rain:     { name: 'Rain',           fn: rain },
    ocean:    { name: 'Ocean Waves',    fn: oceanWaves },
    binaural: { name: 'Binaural Focus', fn: binauralFocus },
    campfire: { name: 'Campfire',       fn: campfire },
    fan:      { name: 'Fan / AC',       fn: fan },
  };

  function play(key) {
    stopAll();
    if (key && SOUNDS[key]) SOUNDS[key].fn();
  }

  return { play, stopAll, setVolume, chime, SOUNDS, getCtx };
})();
