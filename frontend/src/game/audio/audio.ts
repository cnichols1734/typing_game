import type { Hull } from "../types";

type Bed = "idle" | "combat" | "boss";
type Sample = "laser" | "large" | "medium" | "medium2" | "small" | "small2" | "tab";

const THEME_VOL = 0.39;
const THEME_SRC = "/audio/vector-chase-loop.mp3";

const SAMPLE_SRC: Record<Sample, string> = {
  laser: "/audio/laser-shoot.mp3",
  large: "/audio/large-explosion.mp3",
  medium: "/audio/medium-explosion.mp3",
  medium2: "/audio/medium-explosion-2.mp3",
  small: "/audio/small-explosion.mp3",
  small2: "/audio/small-explosion-2.mp3",
  tab: "/audio/tab.mp3",
};

const SAMPLE_VOL: Record<Sample, number> = {
  laser: 0.42,
  large: 0.72,
  medium: 0.58,
  medium2: 0.58,
  small: 0.5,
  small2: 0.5,
  tab: 0.62,
};

const Ctor = typeof window !== "undefined"
  ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  : undefined;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicOn = false;
let theme: HTMLAudioElement | null = null;
let themeFade = 0;
let themeUnlocked = false;
let buffers = new Map<Sample, AudioBuffer>();
let load: Promise<void> | null = null;
let samplesReady = false;
let armed = false;
const pending: Array<() => void> = [];

export function boomBank(hull: Hull | "fail"): "large" | "medium" | "small" {
  if (hull === "capital") return "large";
  if (hull === "cruiser" || hull === "dreadnought" || hull === "fail") return "medium";
  return "small";
}

function pick<T>(bank: readonly T[]): T {
  return bank[Math.floor(Math.random() * bank.length)]!;
}

function audioCtx(): AudioContext | null {
  if (!Ctor) return null;
  if (!ctx || ctx.state === "closed") {
    try {
      ctx = new Ctor({ latencyHint: "interactive" });
    } catch {
      ctx = new Ctor();
    }
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    buffers = new Map();
    load = null;
    samplesReady = false;
  }
  return ctx;
}

function out(ac: AudioContext): AudioNode {
  return master ?? ac.destination;
}

async function wake(ac: AudioContext): Promise<void> {
  if (ac.state !== "running") {
    try {
      await ac.resume();
    } catch {
      /* iOS rejects resume outside a gesture; next tap retries. */
    }
  }
}

function chirp(ac: AudioContext): void {
  try {
    const buf = ac.createBuffer(1, 1, ac.sampleRate);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(out(ac));
    src.start(0);
  } catch {
    /* ignore */
  }
}

function ensureTheme(): HTMLAudioElement {
  if (!theme) {
    const el = new Audio(THEME_SRC);
    el.loop = true;
    el.preload = "auto";
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.volume = THEME_VOL;
    theme = el;
  }
  return theme;
}

async function unlockTheme(): Promise<void> {
  if (themeUnlocked) return;
  const el = ensureTheme();
  if (!el.paused && !el.muted) {
    themeUnlocked = true;
    return;
  }
  const restore = el.volume;
  el.muted = true;
  el.volume = 0;
  try {
    await el.play();
    if (!musicOn) {
      el.pause();
      el.currentTime = 0;
    }
    themeUnlocked = true;
  } catch {
    /* first gesture can still fail if the element is not ready */
  }
  el.muted = false;
  el.volume = musicOn ? THEME_VOL : restore;
}

async function decode(ac: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`audio ${res.status} ${url}`);
  const raw = await res.arrayBuffer();
  const copy = raw.slice(0);
  try {
    return await ac.decodeAudioData(copy);
  } catch {
    return await new Promise<AudioBuffer>((resolve, reject) => {
      ac.decodeAudioData(raw.slice(0), resolve, reject);
    });
  }
}

function flush(): void {
  const jobs = pending.splice(0, pending.length);
  for (const job of jobs) job();
}

function loadSamples(ac: AudioContext): Promise<void> {
  if (load) return load;
  load = (async () => {
    const names = Object.keys(SAMPLE_SRC) as Sample[];
    await Promise.all(names.map(async (name) => {
      if (buffers.has(name)) return;
      try {
        buffers.set(name, await decode(ac, SAMPLE_SRC[name]));
      } catch {
        /* synth fallback covers a failed decode */
      }
    }));
    samplesReady = true;
    flush();
  })();
  return load;
}

function playBuffer(ac: AudioContext, buf: AudioBuffer, vol: number): void {
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(g);
  g.connect(out(ac));
  src.start();
}

function playSample(name: Sample, fallback: () => void): void {
  const ac = audioCtx();
  if (!ac) return;
  void wake(ac);
  const buf = buffers.get(name);
  if (buf) {
    playBuffer(ac, buf, SAMPLE_VOL[name]);
    return;
  }
  if (!samplesReady) {
    if (pending.length < 12) pending.push(() => playSample(name, fallback));
    void loadSamples(ac);
    return;
  }
  fallback();
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
  const n = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function synthLaser(): void {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const dest = out(ac);

  const click = ac.createBufferSource();
  click.buffer = noiseBuffer(ac, 0.018);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2800;
  const cg = envGain(ac, 0.16, 0.001, 0.02);
  click.connect(hp);
  hp.connect(cg);
  cg.connect(dest);
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
  ng.connect(dest);
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
  og.connect(dest);
  osc.start();
  osc.stop(t + 0.12);
}

function synthBoom(hull: Hull | "fail"): void {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime;
  const dest = out(ac);
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
  sg.connect(dest);
  sub.start();
  sub.stop(t + dur);

  const body = ac.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(capital ? 90 : 130, t);
  body.frequency.exponentialRampToValueAtTime(40, t + dur * 0.45);
  const bg = envGain(ac, vol * 0.35, 0.004, dur * 0.5);
  body.connect(bg);
  bg.connect(dest);
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
  ng.connect(dest);
  src.start();
}

function playTheme(): void {
  const el = ensureTheme();
  el.volume = THEME_VOL;
  const play = el.play();
  if (play) void play.catch(() => { /* next gesture retries */ });
}

export function isMusicOn(): boolean {
  return musicOn;
}

export function setMusicOn(on: boolean): void {
  musicOn = on;
  const el = ensureTheme();
  window.cancelAnimationFrame(themeFade);
  if (!on) {
    const from = el.volume;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 400);
      el.volume = from * (1 - t);
      if (t < 1) themeFade = window.requestAnimationFrame(step);
      else if (!musicOn) {
        el.pause();
        el.volume = THEME_VOL;
      }
    };
    themeFade = window.requestAnimationFrame(step);
    return;
  }
  void unlockAudio();
  playTheme();
}

export function setBed(_next?: Bed): void {
  if (!musicOn) return;
  void unlockAudio();
  playTheme();
}

export function sfxLaser(): void {
  playSample("laser", synthLaser);
}

export function sfxError(): void {
  const ac = audioCtx();
  if (!ac) return;
  void wake(ac);
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
  g.connect(out(ac));
  osc.start();
  osc.stop(t + 0.13);
}

export function sfxBoom(hull: Hull | "fail" = "fighter"): void {
  const bank = boomBank(hull);
  const name = bank === "large" ? "large" : pick(bank === "medium" ? ["medium", "medium2"] as const : ["small", "small2"] as const);
  playSample(name, () => synthBoom(hull));
}

export function sfxBreach(): void {
  const ac = audioCtx();
  if (!ac) return;
  void wake(ac);
  const t = ac.currentTime;
  const dest = out(ac);
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(70, t);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.32);
  const g = envGain(ac, 0.16, 0.01, 0.3);
  osc.connect(g);
  g.connect(dest);
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
  ng.connect(dest);
  n.start();
}

export function sfxUi(): void {
  const ac = audioCtx();
  if (!ac) return;
  void wake(ac);
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, ac.currentTime);
  const g = envGain(ac, 0.04, 0.004, 0.07);
  osc.connect(g);
  g.connect(out(ac));
  osc.start();
  osc.stop(ac.currentTime + 0.08);
}

export function sfxStreak(): void {
  const ac = audioCtx();
  if (!ac) return;
  void wake(ac);
  const t = ac.currentTime;
  [392, 494, 587].forEach((f, i) => {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = envGain(ac, 0.035, 0.01, 0.16);
    osc.connect(g);
    g.connect(out(ac));
    osc.start(t + i * 0.05);
    osc.stop(t + i * 0.05 + 0.2);
  });
}

export function sfxSystem(): void {
  const ac = audioCtx();
  if (!ac) return;
  void wake(ac);
  const t = ac.currentTime;
  const dest = out(ac);
  [196, 247, 330, 392].forEach((f, i) => {
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f;
    const g = envGain(ac, 0.045, 0.008, 0.2);
    osc.connect(g);
    g.connect(dest);
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
  cg.connect(dest);
  click.start(t + 0.16);
}

export function sfxSalvo(): void {
  playSample("tab", sfxUi);
}

export function sfxCannon(): void {
  const ac = audioCtx();
  if (!ac) return;
  void wake(ac);
  const t = ac.currentTime;
  const dest = out(ac);
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
  g.connect(dest);
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
  ng.connect(dest);
  noise.start();
  noise.stop(t + 0.14);
}

export function sfxPop(): void {
  const ac = audioCtx();
  if (!ac) return;
  void wake(ac);
  const t = ac.currentTime;
  const dest = out(ac);
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(540, t);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  const g = envGain(ac, 0.1, 0.002, 0.07);
  osc.connect(g);
  g.connect(dest);
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
  cg.connect(dest);
  click.start();
  click.stop(t + 0.04);
}

export async function unlockAudio(): Promise<void> {
  const ac = audioCtx();
  if (!ac) return;
  const cold = ac.state !== "running";
  if (cold) chirp(ac);
  await wake(ac);
  if (cold) chirp(ac);
  void unlockTheme();
  void loadSamples(ac);
}

function armUnlock(): void {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const kick = () => {
    void unlockAudio();
  };
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  for (const ev of ["pointerdown", "pointerup", "touchstart", "touchend", "click", "keydown"]) {
    window.addEventListener(ev, kick, opts);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void unlockAudio();
  });
  window.addEventListener("pageshow", kick);
  window.addEventListener("focus", kick);
}

armUnlock();
