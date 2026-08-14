import Phaser from "phaser";
import { fetchScores, postScore } from "../api/client";
import { sfxUi, isMusicOn, setMusicOn, unlockAudio, setBed } from "../game/audio/audio";
import { bus } from "../game/systems/bus";
import { randomSeed } from "../game/systems/rng";
import type { RunSummary, ScorePeriod, ScoreRow } from "../game/types";
import { PlayScene } from "../game/scenes/PlayScene";
import { hideHud } from "./hud";
import { setKeyboard } from "./keyboard";
import { wordLayer } from "./layer";

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch
  ));
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 24);
}

function validName(name: string): boolean {
  return /^[A-Za-z][A-Za-z '\-]{0,22}[A-Za-z]$/.test(name);
}

function show(el: HTMLElement, on: boolean): void {
  el.classList.toggle("hidden", !on);
}

function renderBoard(list: HTMLElement, rows: ScoreRow[]): void {
  list.replaceChildren();
  const head = document.createElement("li");
  head.className = "head";
  head.innerHTML = "<span>Rank</span><span>Name</span><span>Wave</span><span>WPM</span><span>Score</span>";
  list.appendChild(head);
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Awaiting first mark.";
    list.appendChild(empty);
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="rank">${String(i + 1).padStart(2, "0")}</span><span class="tag3">${esc(row.callsign)}</span><span class="wave">${row.round}</span><span class="wpm">${Math.round(row.wpm)}</span><span class="pts">${row.score}</span>`;
    list.appendChild(li);
  });
}

async function loadBoard(period: ScorePeriod, target: HTMLElement): Promise<void> {
  try {
    const { scores } = await fetchScores(period);
    renderBoard(target, scores);
  } catch {
    renderBoard(target, []);
  }
}

export function mountShell(game: Phaser.Game): void {
  const menu = $("screen-menu");
  const results = $("screen-results");
  const pause = $("screen-pause");
  const boardAlltime = $("board-alltime");
  const boardToday = $("board-today");
  const resultsAlltime = $("results-alltime");
  const resultsToday = $("results-today");
  const musicBtn = $("btn-music") as HTMLButtonElement;
  const form = $("callsign-form") as HTMLFormElement;
  const callsign = $("callsign") as HTMLInputElement;
  const submitNote = $("submit-note");
  const submitBtn = $("btn-submit") as HTMLButtonElement;

  let lastRun: RunSummary | null = null;

  const saved = localStorage.getItem("aphelion-callsign");
  if (saved) callsign.value = saved;

  const loadMenuBoards = () => {
    void loadBoard("all", boardAlltime);
    void loadBoard("day", boardToday);
  };

  const loadResultBoards = () => {
    void loadBoard("all", resultsAlltime);
    void loadBoard("day", resultsToday);
  };

  loadMenuBoards();

  musicBtn.textContent = isMusicOn() ? "Music on" : "Music off";
  const beginTheme = () => {
    unlockAudio();
    if (isMusicOn()) setBed();
  };
  window.addEventListener("pointerdown", beginTheme, { once: true });
  window.addEventListener("keydown", beginTheme, { once: true });

  musicBtn.addEventListener("click", () => {
    unlockAudio();
    setMusicOn(!isMusicOn());
    musicBtn.textContent = isMusicOn() ? "Music on" : "Music off";
    sfxUi();
  });

  const start = () => {
    unlockAudio();
    setBed();
    sfxUi();
    show(menu, false);
    show(results, false);
    show(pause, false);
    setKeyboard(true);
    wordLayer.clear();
    if (game.scene.isActive("menu")) game.scene.stop("menu");
    if (game.scene.isActive("play")) game.scene.stop("play");
    game.scene.start("play", { mode: "arcade", seed: randomSeed() });
  };

  $("btn-play").addEventListener("click", start);

  $("btn-resume").addEventListener("click", () => {
    sfxUi();
    const play = game.scene.getScene("play") as PlayScene;
    play.resumePlay();
  });

  $("btn-abort").addEventListener("click", () => {
    sfxUi();
    const play = game.scene.getScene("play") as PlayScene;
    play.abortRun();
  });

  const toMenu = () => {
    hideHud();
    setKeyboard(false);
    wordLayer.clear();
    show(results, false);
    show(pause, false);
    show(menu, true);
    if (!game.scene.isActive("menu")) game.scene.start("menu");
    loadMenuBoards();
    setBed("idle");
  };

  $("btn-menu").addEventListener("click", () => {
    sfxUi();
    toMenu();
  });

  $("btn-again").addEventListener("click", () => {
    sfxUi();
    start();
  });

  bus.on("abort", () => toMenu());

  bus.on("gameover", (run) => {
    lastRun = run;
    hideHud();
    setKeyboard(false);
    wordLayer.clear();
    if (game.scene.isActive("play")) game.scene.stop("play");
    if (!game.scene.isActive("menu")) game.scene.start("menu");
    $("res-score").textContent = String(run.score);
    $("res-round").textContent = String(run.round);
    $("res-wpm").textContent = String(Math.round(run.wpm));
    $("res-acc").textContent = `${Math.round(run.accuracy * 100)}%`;
    $("res-streak").textContent = String(run.bestStreak);
    $("results-eyebrow").textContent = "GUNLINE BREACHED";
    submitNote.textContent = "";
    submitBtn.disabled = false;
    show(menu, false);
    show(results, true);
    loadResultBoards();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!lastRun) return;
    const tag = cleanName(callsign.value);
    if (!validName(tag)) {
      submitNote.textContent = "Name, 2–24 letters.";
      return;
    }
    callsign.value = tag;
    localStorage.setItem("aphelion-callsign", tag);
    submitBtn.disabled = true;
    try {
      await postScore(lastRun, tag);
      submitNote.textContent = "Posted.";
      loadResultBoards();
    } catch (err) {
      submitNote.textContent = err instanceof Error ? err.message : "Board rejected the mark.";
      submitBtn.disabled = false;
    }
  });
}
