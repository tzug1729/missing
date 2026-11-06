(() => {
  'use strict';

  const film = document.getElementById('film');
  const ending = document.getElementById('ending');
  const canvas = document.getElementById('effects');
  const context = canvas.getContext('2d');
  const shots = [...document.querySelectorAll('[data-scene]')];
  const replay = document.getElementById('replay');
  const skip = document.getElementById('skip');
  const sound = document.getElementById('sound');
  const soundLabel = document.getElementById('sound-label');
  const progress = document.getElementById('progress');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const AudioClass = window.AudioContext || window.webkitAudioContext;
  const duration = 12100;
  const cuts = [
    { at: 0, name: 'threshold' },
    { at: 900, name: 'first' },
    { at: 1900, name: 'second' },
    { at: 3100, name: 'encounter' },
    { at: 5100, name: 'passage' },
    { at: 6800, name: 'charge' },
    { at: 7900, name: 'impact' },
    { at: 9900, name: 'result' },
  ];
  const colors = ['#a82c36', '#e8dccc', '#7d1d2a', '#f5f0e6', '#9bada4'];
  const voices = new Set();
  let width = 0, height = 0, frame = 0;
  let started = 0, previous = 0, elapsed = 0, nextCut = 0;
  let active = '', playing = false, soundOn = false, audio;
  let motes = [], sparks = [];
  let run = 0;

  function resize() {
    const box = film.getBoundingClientRect();
    width = box.width;
    height = box.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0);
    motes = Array.from({ length: width < 700 ? 85 : 140 }, () => ({
      angle: Math.random() * Math.PI * 2,
      distance: Math.random(),
      speed: .002 + Math.random() * .007,
      size: .5 + Math.random() * 1.4,
    }));
  }

  function burst(count, force = 1) {
    if (!context || motion.matches) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = (3 + Math.random() * 13) * force;
      sparks.push({
        x: width * .5, y: height * .46,
        vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity - 2,
        size: 2 + Math.random() * 5, rotation: Math.random() * 7,
        spin: (Math.random() - .5) * .2,
        life: 0, limit: 110 + Math.random() * 95,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  function paint(step) {
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const cx = width * .5, cy = height * .46;
    const radius = Math.hypot(width, height) * .65;
    const charging = active === 'charge';
    const settled = active === 'result';
    const speed = charging ? -.7 : settled ? .12 : .55;
    // Perspective streaks accelerate toward the viewer, then reverse into the burst.
    for (const mote of motes) {
      mote.distance += mote.speed * speed * step;
      if (mote.distance > 1) mote.distance = .01;
      if (mote.distance < 0) mote.distance = 1;
      const distance = mote.distance * mote.distance * radius;
      const tail = distance * (settled ? .015 : charging ? .22 : .12);
      const dx = Math.cos(mote.angle), dy = Math.sin(mote.angle);
      context.strokeStyle = `rgba(176,65,77,${Math.min(.65, mote.distance * (settled ? .24 : .65))})`;
      context.lineWidth = mote.size * (settled ? .6 : 1);
      context.beginPath();
      context.moveTo(cx + dx * distance, cy + dy * distance);
      context.lineTo(cx + dx * (distance + tail), cy + dy * (distance + tail));
      context.stroke();
    }
    sparks = sparks.filter(p => p.life < p.limit && p.y < height + 40);
    for (const p of sparks) {
      p.life += step;
      p.vx *= Math.pow(.985, step);
      p.vy += .075 * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rotation += p.spin * step;
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.rotation);
      context.globalAlpha = Math.min(1, (p.limit - p.life) / 45);
      context.fillStyle = p.color;
      context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (.3 + Math.abs(Math.cos(p.life * .08))));
      context.restore();
    }
    // Curving red filaments echo the threads in the title artwork.
    if (!settled && active !== 'encounter') {
      const time = elapsed / 1000;
      context.lineWidth = .7;
      for (let strand = 0; strand < 5; strand++) {
        context.strokeStyle = `rgba(168,44,54,${charging ? .65 : .23})`;
        context.beginPath();
        for (let point = 0; point <= 45; point++) {
          const unit = point / 45;
          const angle = unit * Math.PI * 2.5 + strand * 1.2 + time * (charging ? 1.8 : .18);
          const r = (charging ? Math.max(.04, 1 - (elapsed - 6800) / 1100) : .8) * Math.min(width, height) * (.2 + unit * .6);
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r * 1.45;
          if (!point) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
      }
    }
  }

  function tone(frequency, delay, length, volume, type = 'sine', endFrequency) {
    if (!audio || !soundOn) return;
    const at = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + length);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, at + length);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(at);
    oscillator.stop(at + length + .02);
  }

  function silence() {
    for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    voices.clear();
  }

  function cue(name) {
    if (name === 'threshold') {
      tone(70, 0, .85, .045, 'sine', 45);
    } else if (name === 'encounter') {
      [659.25, 783.99].forEach((hz, i) => tone(hz, i * .16, .8, .025));
    } else if (name === 'first' || name === 'second') {
      tone(name === 'second' ? 293.66 : 220, 0, .8, .025, 'sine');
    } else if (name === 'passage') {
      [220, 293.66, 440].forEach((hz, i) => tone(hz, i * .3, .8, .02));
    } else if (name === 'charge') {
      tone(180, 0, 1.03, .025, 'sine', 1700);
    } else if (name === 'impact') {
      tone(130, 0, .65, .06, 'sine', 30);
      [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => tone(hz, i * .045, 1.5, .035, 'triangle'));
    } else if (name === 'result') {
      [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => tone(hz, i * .12, 1.3, .025));
    }
  }

  function cut(name, withEffects = true) {
    active = name;
    film.dataset.scene = name;
    for (const shot of shots) shot.classList.toggle('active', shot.dataset.scene === name);
    film.classList.toggle('result', name === 'result');
    if (!withEffects) return;
    if (name === 'impact') burst(width < 700 ? 45 : 70, .55);
    if (name === 'result') burst(20, .25);
    cue(name);
  }

  function finish() {
    playing = false;
    cancelAnimationFrame(frame);
    frame = 0;
    silence();
    cut('result', false);
    film.classList.remove('running');
    film.classList.add('finished');
    progress.style.transform = 'scaleX(1)';
    skip.hidden = true;
    replay.hidden = false;
    if (context) context.clearRect(0, 0, width, height);
  }

  function tick(now) {
    elapsed = now - started;
    const step = Math.min(Math.max((now - previous) / 16.667, 0), 2.5);
    previous = now;
    // A stalled device goes straight to its current shot.
    let latest;
    while (nextCut < cuts.length && elapsed >= cuts[nextCut].at) latest = cuts[nextCut++];
    if (latest) cut(latest.name);
    progress.style.transform = `scaleX(${Math.min(elapsed / duration, 1)})`;
    paint(step);
    if (elapsed >= duration) { finish(); return; }
    frame = requestAnimationFrame(tick);
  }

  function play() {
    run += 1;
    cancelAnimationFrame(frame);
    silence();
    sparks = [];
    resize();
    replay.hidden = true;
    skip.hidden = false;
    ending.scrollTop = 0;
    film.classList.remove('finished', 'result');
    film.classList.add('running');
    for (const shot of shots) shot.classList.remove('active');
    void film.offsetWidth;
    active = '';
    elapsed = 0;
    nextCut = 0;
    progress.style.transform = 'scaleX(0)';
    if (motion.matches) { finish(); return; }
    playing = true;
    started = previous = performance.now();
    cut(cuts[nextCut++].name);
    frame = requestAnimationFrame(tick);
  }

  replay.addEventListener('click', play);
  skip.addEventListener('click', finish);
  sound.addEventListener('click', async () => {
    if (soundOn) {
      soundOn = false;
      silence();
    } else {
      const pendingRun = run;
      try {
        audio ||= new AudioClass();
        await audio.resume();
        if (document.hidden || pendingRun !== run) return;
        soundOn = true;
        play();
      } catch { sound.hidden = true; return; }
    }
    sound.setAttribute('aria-pressed', String(soundOn));
    sound.setAttribute('aria-label', soundOn ? '音を消す' : '音ありで最初から再生');
    soundLabel.textContent = soundOn ? '音あり' : '音を出す';
  });
  window.addEventListener('resize', resize);
  window.addEventListener('pageshow', event => { if (event.persisted && !document.hidden) play(); });
  motion.addEventListener('change', () => { if (motion.matches) finish(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      run += 1;
      if (playing) finish();
      else silence();
    }
  });
  if (AudioClass) {
    sound.hidden = false;
    sound.setAttribute('aria-label', '音ありで最初から再生');
  }
  if (!document.hidden) play();
  else finish();
})();
