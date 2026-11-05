(() => {
  'use strict';

  const scene = document.querySelector('.scene');
  const canvas = document.getElementById('confetti');
  const replay = document.getElementById('replay');
  const soundButton = document.getElementById('sound');
  const soundLabel = document.getElementById('sound-label');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const context = canvas.getContext('2d');
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let audioContext;
  let soundEnabled = false;
  let frame = 0;
  let burstTimer = 0;
  let revealTimer = 0;
  let width = 0;
  let height = 0;
  let particles = [];
  let lastTime = 0;
  let playId = 0;
  const voices = new Set();
  const colors = ['#e9c562', '#f9e8ab', '#a88636', '#fff4d4', '#c64b32'];
  scene.classList.add('preparing');

  function resize() {
    const bounds = scene.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function burst(count, centerY, force) {
    if (!context || reduceMotion.matches) return;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (3 + Math.random() * 9) * force;
      particles.push({
        x: width / 2, y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - .5) * .17,
        size: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 0, maxLife: 170 + Math.random() * 80,
      });
    }
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(draw);
    }
  }

  function draw(now) {
    const step = Math.min((now - lastTime) / 16.667, 2);
    lastTime = now;
    context.clearRect(0, 0, width, height);
    particles = particles.filter(p => p.life < p.maxLife && p.y < height + 30);
    for (const p of particles) {
      p.life += step;
      p.vx *= Math.pow(.987, step);
      p.vy += .095 * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rotation += p.spin * step;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.rotation);
      context.globalAlpha = Math.min(1, (p.maxLife - p.life) / 45);
      context.fillStyle = p.color;
      context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (.4 + Math.abs(Math.cos(p.life * .07))));
      context.restore();
    }
    frame = particles.length ? requestAnimationFrame(draw) : 0;
  }

  function tone(frequency, offset, duration, volume, type = 'sine', endFrequency) {
    if (!audioContext || !soundEnabled) return;
    const at = audioContext.currentTime + offset;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at);
    oscillator.stop(at + duration + .02);
  }

  function stopSound() {
    for (const voice of voices) {
      try { voice.stop(); } catch { /* Already stopped. */ }
    }
    voices.clear();
  }

  function playSound() {
    stopSound();
    tone(110, 0, .45, .18, 'sine', 38);
    [523.25, 659.25, 783.99, 1046.5].forEach((note, i) => tone(note, .07 + i * .075, .6, .055, 'triangle'));
    [523.25, 783.99, 1046.5].forEach(note => tone(note, 1.13, .9, .035, 'sine'));
    tone(95, 1.13, .25, .14, 'sine', 35);
  }

  function stopEffects() {
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(burstTimer);
    clearTimeout(revealTimer);
    particles = [];
    if (context) context.clearRect(0, 0, width, height);
    stopSound();
  }

  function play() {
    stopEffects();
    const currentPlay = ++playId;
    scene.classList.remove('preparing');
    replay.hidden = true;
    scene.classList.remove('playing');
    // Restart the same CSS sequence without navigating or reloading the image.
    void scene.offsetWidth;
    scene.classList.add('playing');
    resize();
    burst(window.innerWidth < 700 ? 105 : 165, height * .32, 1);
    burstTimer = window.setTimeout(() => burst(55, height * .47, .6), 1150);
    revealTimer = window.setTimeout(() => { replay.hidden = false; }, reduceMotion.matches ? 0 : 2900);
    if (soundEnabled && audioContext) {
      audioContext.resume().then(() => {
        if (currentPlay === playId && !document.hidden) playSound();
      }).catch(() => {});
    }
  }

  soundButton.addEventListener('click', async () => {
    if (soundEnabled) {
      soundEnabled = false;
      stopSound();
    } else {
      try {
        audioContext ||= new AudioContextClass();
        await audioContext.resume();
        soundEnabled = true;
        play();
      } catch {
        soundButton.hidden = true;
        return;
      }
    }
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.setAttribute('aria-label', soundEnabled ? '演出の音を消す' : '演出の音を出す');
    soundLabel.textContent = soundEnabled ? '音あり' : '音を出す';
  });

  replay.addEventListener('click', play);
  window.addEventListener('resize', resize);
  reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) stopEffects(); replay.hidden = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { playId += 1; stopEffects(); replay.hidden = false; }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) play(); });

  async function start() {
    const image = document.querySelector('.portrait img');
    // A slow connection must not leave the visitor waiting for an interaction.
    await Promise.race([
      image.decode().catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 1800)),
    ]);
    if (AudioContextClass) soundButton.hidden = false;
    play();
  }

  start();
})();
