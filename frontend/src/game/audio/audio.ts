import { Howl } from "howler";
import type { Hull } from "../types";

type Bed = "idle" | "combat" | "boss";

const THEME_VOL = 0.39;
const THEME_SRC = "/audio/vector-chase-loop.mp3";

let ctx: AudioContext | null = null;
let musicOn = true;
let theme: Howl | null = null;

function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function ensureTheme(): Howl {
  if (!theme) {
    theme = new Howl({
      src: [THEME_SRC],
      loop: true,
      volume: THEME_VOL,
      html5: true,
      preload: true,
    });
  }
  return theme;
}

function playTheme(): void {
  const track = ensureTheme();
  if (!track.playing()) track.play();
  track.volume(THEME_VOL);
}

export function isMusicOn(): boolean {
  return musicOn;
}

export function setMusicOn(on: boolean): void {
  musicOn = on;
  const track = ensureTheme();
  if (!on) {
    track.fade(track.volume(), 0, 400);
    window.setTimeout(() => {
      if (!musicOn) track.pause();
    }, 420);
    return;
  }
  audioCtx();
  playTheme();
}

export function setBed(_next?: Bed): void {
  if (!musicOn) return;
  audioCtx();
  playTheme();
}

function envGain(ac: AudioContext, vol: number, attack: number, release: number): GainNode {
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  return g;
}

function noiseBuffer(ac: AudioContext, dur: number): AudioBuffer {
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function sfxLaser(): void {
  const ac = audioCtx();
  const t = ac.currentTime;

  const click = ac.createBufferSource();
  click.buffer = noiseBuffer(ac, 0.018);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2800;
  const cg = envGain(ac, 0.16, 0.001, 0.02);
  click.connect(hp);
  hp.connect(cg);
  cg.connect(ac.destination);
  click.start();
  click.stop(t + 0.025);

  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer(ac, 0.07);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(1900, t);
  bp.frequency.exponentialRampToValueAtTime(280, t + 0.09);
  bp.Q.value = 2.4;
  const ng = envGain(ac, 0.14, 0.003, 0.08);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(ac.destination);
  noise.start();
  noise.stop(t + 0.1);

  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(720, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.11);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2400, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.1);
  const og = envGain(ac, 0.055, 0.002, 0.1);
  osc.connect(lp);
  lp.connect(og);
  og.connect(ac.destination);
  osc.start();
  osc.stop(t + 0.12);
}

export function sfxError(): void {
  const ac = audioCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(210, t);
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 380;
  const g = envGain(ac, 0.08, 0.004, 0.11);
  osc.connect(f);
  f.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(t + 0.13);
}

export function sfxBoom(hull: Hull | "fail" = "fighter"): void {
  const ac = audioCtx();
  const t = ac.currentTime;
  const capital = hull === "capital";
  const heavy = capital || hull === "dreadnought" || hull === "fail";
  const dur = capital ? 1.35 : heavy ? 0.78 : 0.42;
  const vol = capital ? 0.55 : heavy ? 0.4 : 0.26;

  const sub = ac.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(capital ? 36 : heavy ? 48 : 68, t);
  sub.frequency.exponentialRampToValueAtTime(22, t + dur * 0.7);
  const sg = envGain(ac, vol * 0.85, 0.006, dur * 0.8);
  sub.connect(sg);
  sg.connect(ac.destination);
  sub.start();
  sub.stop(t + dur);

  const body = ac.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(capital ? 90 : 130, t);
  body.frequency.exponentialRampToValueAtTime(40, t + dur * 0.45);
  const bg = envGain(ac, vol * 0.35, 0.004, dur * 0.5);
  body.connect(bg);
  bg.connect(ac.destination);
  body.start();
  body.stop(t + dur * 0.55);

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(capital ? 1800 : heavy ? 1200 : 900, t);
  lp.frequency.exponentialRampToValueAtTime(70, t + dur);
  const ng = envGain(ac, vol, 0.004, dur);
  src.connect(lp);
  lp.connect(ng);
  ng.connect(ac.destination);
  src.start();

  const grit = ac.createBufferSource();
  grit.buffer = noiseBuffer(ac, 0.14);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.8;
  const gg = envGain(ac, vol * 0.45, 0.002, 0.12);
  grit.connect(bp);
  bp.connect(gg);
  gg.connect(ac.destination);
  grit.start();

  if (heavy) {
    const crack = ac.createBufferSource();
    crack.buffer = noiseBuffer(ac, capital ? 0.28 : 0.16);
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1600;
    const cg = envGain(ac, capital ? 0.2 : 0.12, 0.002, capital ? 0.24 : 0.14);
    crack.connect(hp);
    hp.connect(cg);
    cg.connect(ac.destination);
    crack.start(t + 0.05);
  }

  if (capital) {
    const late = ac.createBufferSource();
    late.buffer = noiseBuffer(ac, 0.35);
    const llp = ac.createBiquadFilter();
    llp.type = "lowpass";
    llp.frequency.setValueAtTime(700, t + 0.22);
    llp.frequency.exponentialRampToValueAtTime(80, t + 0.7);
    const lg = envGain(ac, 0.22, 0.01, 0.45);
    late.connect(llp);
    llp.connect(lg);
    lg.connect(ac.destination);
    late.start(t + 0.2);
  }
}

export function sfxBreach(): void {
  const ac = audioCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(70, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.32);
  const g = envGain(ac, 0.16, 0.01, 0.3);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(t + 0.34);

  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac, 0.2);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 240;
  const ng = envGain(ac, 0.1, 0.006, 0.18);
  n.connect(lp);
  lp.connect(ng);
  ng.connect(ac.destination);
  n.start();
}

export function sfxUi(): void {
  const ac = audioCtx();
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, ac.currentTime);
  const g = envGain(ac, 0.04, 0.004, 0.07);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.08);
}

export function sfxStreak(): void {
  const ac = audioCtx();
  const t = ac.currentTime;
  [392, 494, 587].forEach((f, i) => {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = envGain(ac, 0.035, 0.01, 0.16);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t + i * 0.05);
    osc.stop(t + i * 0.05 + 0.2);
  });
}

export function sfxSystem(): void {
  const ac = audioCtx();
  const t = ac.currentTime;
  [196, 247, 330, 392].forEach((f, i) => {
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = envGain(ac, 0.045, 0.008, 0.2);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t + i * 0.045);
    osc.stop(t + i * 0.045 + 0.24);
  });
  const click = ac.createBufferSource();
  click.buffer = noiseBuffer(ac, 0.03);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2200;
  const cg = envGain(ac, 0.08, 0.002, 0.04);
  click.connect(hp);
  hp.connect(cg);
  cg.connect(ac.destination);
  click.start(t + 0.16);
}

export function sfxSalvo(): void {
  const ac = audioCtx();
  const t = ac.currentTime;

  const charge = ac.createOscillator();
  charge.type = "sawtooth";
  charge.frequency.setValueAtTime(90, t);
  charge.frequency.exponentialRampToValueAtTime(420, t + 0.16);
  const clp = ac.createBiquadFilter();
  clp.type = "lowpass";
  clp.frequency.setValueAtTime(600, t);
  clp.frequency.exponentialRampToValueAtTime(2400, t + 0.16);
  const cg = envGain(ac, 0.08, 0.02, 0.16);
  charge.connect(clp);
  clp.connect(cg);
  cg.connect(ac.destination);
  charge.start();
  charge.stop(t + 0.2);

  const sub = ac.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(42, t + 0.14);
  sub.frequency.exponentialRampToValueAtTime(20, t + 0.9);
  const sg = envGain(ac, 0.5, 0.008, 0.72);
  sub.connect(sg);
  sg.connect(ac.destination);
  sub.start(t + 0.14);
  sub.stop(t + 0.95);

  const body = ac.createBufferSource();
  body.buffer = noiseBuffer(ac, 0.7);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1600, t + 0.14);
  lp.frequency.exponentialRampToValueAtTime(70, t + 0.8);
  const bg = envGain(ac, 0.42, 0.006, 0.68);
  body.connect(lp);
  lp.connect(bg);
  bg.connect(ac.destination);
  body.start(t + 0.14);

  const crack = ac.createBufferSource();
  crack.buffer = noiseBuffer(ac, 0.22);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const hg = envGain(ac, 0.18, 0.002, 0.18);
  crack.connect(hp);
  hp.connect(hg);
  hg.connect(ac.destination);
  crack.start(t + 0.16);
}

export function sfxCannon(): void {
  const ac = audioCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.22);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(180, t + 0.2);
  const g = envGain(ac, 0.16, 0.004, 0.2);
  osc.connect(lp);
  lp.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(t + 0.24);

  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer(ac, 0.12);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(640, t);
  bp.frequency.exponentialRampToValueAtTime(180, t + 0.14);
  bp.Q.value = 1.6;
  const ng = envGain(ac, 0.12, 0.003, 0.12);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(ac.destination);
  noise.start();
  noise.stop(t + 0.14);
}

export function sfxPop(): void {
  const ac = audioCtx();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(540, t);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  const g = envGain(ac, 0.1, 0.002, 0.07);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(t + 0.09);

  const click = ac.createBufferSource();
  click.buffer = noiseBuffer(ac, 0.03);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1600;
  const cg = envGain(ac, 0.1, 0.001, 0.03);
  click.connect(hp);
  hp.connect(cg);
  cg.connect(ac.destination);
  click.start();
  click.stop(t + 0.04);
}

export function unlockAudio(): void {
  audioCtx();
}
