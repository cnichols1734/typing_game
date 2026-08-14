import Phaser from "phaser";
import { fetchDaily, fetchScores, postScore } from "../api/client";
import { sfxUi, isMusicOn, setMusicOn, unlockAudio, setBed } from "../game/audio/audio";
import { bus } from "../game/systems/bus";
import { randomSeed } from "../game/systems/rng";
import type { Mode, RunSummary, ScoreRow } from "../game/types";
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
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No marks on the board.";
    list.appendChild(empty);
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="rank">${String(i + 1).padStart(2, "0")}</span><span class="tag3">${esc(row.callsign)}</span><span>${row.round} · ${Math.round(row.wpm)} wpm</span><span class="pts">${row.score}</span>`;
    list.appendChild(li);
  });
}

async function loadBoard(mode: Mode, target: HTMLElement): Promise<void> {
  try {
    const { scores } = await fetchScores(mode);
    renderBoard(target, scores);
  } catch {
    renderBoard(target, []);
  }
}

export function mountShell(game: Phaser.Game): void {
  const menu = $("screen-menu");
  const results = $("screen-results");
  const pause = $("screen-pause");
  const boardArcade = $("board-arcade");
  const boardDaily = $("board-daily");
  const resultsBoard = $("results-board");
  const dailyLabel = $("daily-label");
  const musicBtn = $("btn-music") as HTMLButtonElement;
  const form = $("callsign-form") as HTMLFormElement;
  const callsign = $("callsign") as HTMLInputElement;
  const submitNote = $("submit-note");
  const submitBtn = $("btn-submit") as HTMLButtonElement;

  let lastRun: RunSummary | null = null;
  let lastMode: Mode = "arcade";
  let daily: { date: string; seed: string } | null = null;

  const saved = localStorage.getItem("aphelion-callsign");
  if (saved) callsign.value = saved;

  const refreshDaily = async () => {
    try {
      daily = await fetchDaily();
      dailyLabel.textContent = `Daily seed ${daily.date}`;
    } catch {
      dailyLabel.textContent = "Daily board offline";
    }
  };

  const loadMenuBoards = () => {
    void loadBoard("arcade", boardArcade);
    void loadBoard("daily", boardDaily);
  };

  loadMenuBoards();
  void refreshDaily();

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

  const start = (mode: Mode) => {
    unlockAudio();
    setBed();
    sfxUi();
    lastMode = mode;
    const seed = mode === "daily" ? daily?.seed ?? randomSeed() : randomSeed();
    show(menu, false);
    show(results, false);
    show(pause, false);
    setKeyboard(true);
    wordLayer.clear();
    if (game.scene.isActive("menu")) game.scene.stop("menu");
    if (game.scene.isActive("play")) game.scene.stop("play");
    game.scene.start("play", { mode, seed });
  };

  $("btn-arcade").addEventListener("click", () => start("arcade"));
  $("btn-daily").addEventListener("click", () => start("daily"));

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
    void refreshDaily();
    setBed("idle");
  };

  $("btn-menu").addEventListener("click", () => {
    sfxUi();
    toMenu();
  });

  $("btn-again").addEventListener("click", () => {
    sfxUi();
    start(lastMode);
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
    $("results-eyebrow").textContent = run.mode === "daily" ? "DAILY CLOSED" : "GUNLINE BREACHED";
    $("results-board-label").textContent = run.mode === "daily" ? "Daily" : "Arcade";
    submitNote.textContent = "";
    submitBtn.disabled = false;
    show(menu, false);
    show(results, true);
    void loadBoard(run.mode, resultsBoard);
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
      const res = await postScore(lastRun, tag);
      submitNote.textContent = res.kept
        ? "Kept your stronger mark for today."
        : "Posted.";
      void loadBoard(lastRun.mode, resultsBoard);
    } catch (err) {
      submitNote.textContent = err instanceof Error ? err.message : "Board rejected the mark.";
      submitBtn.disabled = false;
    }
  });
}
