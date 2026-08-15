import { Howl, Howler } from "howler";
import type { Hull } from "../types";

type Bed = "idle" | "combat" | "boss";

const THEME_VOL = 0.39;
const THEME_SRC = "/audio/vector-chase-loop.mp3";

const SFX_SRC = {
  laser: "/audio/laser-shoot.mp3",
  large: "/audio/large-explosion.mp3",
  medium: ["/audio/medium-explosion.mp3", "/audio/medium-explosion-2.mp3"] as const,
  small: ["/audio/small-explosion.mp3", "/audio/small-explosion-2.mp3"] as const,
  tab: "/audio/tab.mp3",
};

let ctx: AudioContext | null = null;
let musicOn = false;
let theme: Howl | null = null;
let sfx: {
  laser: Howl;
  large: Howl;
  medium: Howl[];
  small: Howl[];
  tab: Howl;
} | null = null;

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

function cue(src: string, volume: number, pool: number): Howl {
  return new Howl({ src: [src], volume, preload: true, pool });
}

function ensureSfx(): NonNullable<typeof sfx> {
  if (!sfx) {
    sfx = {
      laser: cue(SFX_SRC.laser, 0.42, 24),
      large: cue(SFX_SRC.large, 0.72, 4),
      medium: SFX_SRC.medium.map((src) => cue(src, 0.58, 8)),
      small: SFX_SRC.small.map((src) => cue(src, 0.5, 10)),
      tab: cue(SFX_SRC.tab, 0.62, 4),
    };
  }
  return sfx;
}

function playCue(howl: Howl): void {
  audioCtx();
  if (Howler.ctx?.state === "suspended") void Howler.ctx.resume();
  howl.play();
}

function pickCue(bank: Howl[]): Howl {
  return bank[Math.floor(Math.random() * bank.length)]!;
}

export function sfxLaser(): void {
  playCue(ensureSfx().laser);
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
  const bank = ensureSfx();
  if (hull === "capital") {
    playCue(bank.large);
    return;
  }
  if (hull === "cruiser" || hull === "dreadnought" || hull === "fail") {
    playCue(pickCue(bank.medium));
    return;
  }
  playCue(pickCue(bank.small));
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
  playCue(ensureSfx().tab);
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
  ensureSfx();
  if (Howler.ctx?.state === "suspended") void Howler.ctx.resume();
}
