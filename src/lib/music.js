// Тихий пиксельный lofi прямо в лаунчере: аккорды, простая мелодия, мягкие барабаны и треск пластинки — всё синтезом
// WebAudio, без файлов. Бесконечный: прогрессии меняются, мелодия каждый раз своя. По умолчанию выключен.

let ctx = null;
let master = null;
let timer = null;
let nextTime = 0;
let step = 0;
let volume = 0.25;
let playing = false;
let noiseBuf = null;

// Треки: обычный + открываемые наградами мини-игр (другой темп, лад и тембр)
const TRACKS = {
  default: { bpm: 72, scale: [0, 2, 4, 7, 9], root: 72, lead: 'square', pad: 'triangle', progs: null },
  chains: { bpm: 64, scale: [0, 3, 5, 6, 7, 10], root: 69, lead: 'sawtooth', pad: 'triangle', progs: [[[45, 48, 52, 55], [50, 53, 57, 60], [45, 48, 52, 55], [52, 56, 59, 62]]] }, // блюз
  reeds: { bpm: 60, scale: [0, 2, 4, 7, 9, 11], root: 76, lead: 'sine', pad: 'sine', progs: [[[48, 52, 55, 59], [53, 57, 60, 64], [45, 48, 52, 55], [53, 57, 60, 62]]] }, // тихий плёс
  chase: { bpm: 92, scale: [0, 2, 3, 5, 7, 8], root: 69, lead: 'square', pad: 'sawtooth', progs: [[[45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53], [40, 44, 47, 50]]] }, // погоня
  deep: { bpm: 56, scale: [0, 1, 5, 7, 8], root: 64, lead: 'triangle', pad: 'sine', progs: [[[40, 43, 47, 50], [41, 44, 48, 52], [40, 43, 47, 50], [38, 41, 45, 48]]] } // глубина
};
let track = TRACKS.default;
let STEP = 60 / track.bpm / 4; // шестнадцатая
export function setTrack(id) {
  const t = TRACKS[id] || TRACKS.default;
  if (t === track) return;
  track = t;
  STEP = 60 / t.bpm / 4;
  prog = (t.progs || PROGS)[0];
}
const PROGS = [
  [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], // Fmaj7 Em7 Dm7 Cmaj7
  [[45, 48, 52, 55], [41, 45, 48, 52], [48, 52, 55, 59], [43, 47, 50, 53]], // Am7 Fmaj7 Cmaj7 G7
  [[50, 53, 57, 60], [43, 47, 50, 53], [48, 52, 55, 59], [45, 48, 52, 55]]  // Dm7 G7 Cmaj7 Am7
];
let prog = PROGS[0];
let melodyBar = [];

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(type, freq, t, dur, peak, cutoff) {
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  o.connect(f); f.connect(g); g.connect(master);
  env(g, t, 0.02, peak, dur);
  o.start(t);
  o.stop(t + dur + 0.1);
}

function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  o.connect(g); g.connect(master);
  env(g, t, 0.005, 0.5, 0.25);
  o.start(t); o.stop(t + 0.35);
}

function hiss(t, dur, peak, type, freq) {
  const s = ctx.createBufferSource();
  s.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  const g = ctx.createGain();
  s.connect(f); f.connect(g); g.connect(master);
  env(g, t, 0.003, peak, dur);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

function newMelody() {
  // 16 шагов: редкие ноты пентатоники над аккордом
  const root = track.root;
  const SCALE = track.scale;
  melodyBar = [];
  for (let i = 0; i < 16; i++) melodyBar.push(Math.random() < (i % 4 === 0 ? 0.45 : 0.18) ? root + SCALE[Math.floor(Math.random() * SCALE.length)] - (Math.random() < 0.3 ? 12 : 0) : null);
}

function schedule() {
  while (nextTime < ctx.currentTime + 0.15) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const t = nextTime + (s16 % 2 === 1 ? STEP * 0.18 : 0); // свинг
    if (s16 === 0) {
      if (bar % 8 === 0) { const ps = track.progs || PROGS; prog = ps[Math.floor(Math.random() * ps.length)]; }
      if (bar % 2 === 0) newMelody();
      const chord = prog[bar % 4];
      for (const n of chord) tone(track.pad, hz(n), t, STEP * 15, track.pad === 'sawtooth' ? 0.025 : 0.05, 900);
      tone('sine', hz(chord[0] - 12), t, STEP * 7, 0.12, 400);
    }
    if (s16 === 8) tone('sine', hz(prog[bar % 4][0] - 12), t, STEP * 6, 0.09, 400);
    if (s16 === 0 || s16 === 10) kick(t);
    if (s16 === 4 || s16 === 12) hiss(t, 0.12, 0.08, 'bandpass', 1800);
    if (s16 % 2 === 0) hiss(t, 0.03, s16 % 4 === 2 ? 0.035 : 0.02, 'highpass', 7000);
    const m = melodyBar[s16];
    if (m) tone(track.lead, hz(m), t, STEP * 3, track.lead === 'sine' ? 0.05 : 0.025, 1500);
    if (Math.random() < 0.06) hiss(t, 0.01, 0.015, 'highpass', 3000); // треск пластинки
    nextTime += STEP;
    step++;
  }
}

function ensure() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);
  master.gain.value = volume * 0.6;
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.setTargetAtTime(volume * 0.6, ctx.currentTime, 0.1);
}

export function play() {
  ensure();
  if (ctx.state === 'suspended') ctx.resume();
  if (playing) return;
  playing = true;
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 40);
}

export function stop() {
  playing = false;
  if (timer) clearInterval(timer);
  timer = null;
}

export function isPlaying() { return playing; }

// ---------- звуки мини-игр (короткие и тихие) ----------
let sfxVol = 0.35;
export function setSfxVolume(v) { sfxVol = Math.max(0, Math.min(1, v)); }
export function sfx(name) {
  if (sfxVol <= 0) return;
  ensure();
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(ctx.destination);
  const peak = 0.12 * sfxVol;
  const blip = (type, f1, f2, dur) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    o.connect(g);
    env(g, t, 0.005, peak, dur);
    o.start(t); o.stop(t + dur + 0.05);
  };
  switch (name) {
    case 'jump': blip('square', 300, 600, 0.12); break;
    case 'coin': blip('square', 880, 1320, 0.1); break;
    case 'hit': blip('sawtooth', 200, 60, 0.18); break;
    case 'click': blip('triangle', 600, 500, 0.05); break;
    case 'win': blip('square', 520, 1040, 0.35); break;
    case 'lose': blip('triangle', 400, 90, 0.5); break;
    case 'splash': {
      const s = ctx.createBufferSource(); s.buffer = noise();
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
      s.connect(f); f.connect(g); env(g, t, 0.01, peak, 0.3); s.start(t); s.stop(t + 0.4);
      break;
    }
    default: blip('triangle', 220, 200, 0.05);
  }
}
