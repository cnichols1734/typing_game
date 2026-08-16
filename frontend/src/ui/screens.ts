import { fetchScores, postScore } from "../api/client";
import { sfxUi, isMusicOn, setMusicOn, unlockAudio, setBed } from "../game/audio/audio";
import type { GameApp } from "../game/app";
import { bus } from "../game/systems/bus";
import { randomSeed } from "../game/systems/rng";
import { playPlatform } from "../game/systems/layout";
import type { RunSummary, ScorePeriod, ScoreRow } from "../game/types";
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
  head.innerHTML = "<span>Rank</span><span>Name</span><span>Wave</span><span>WPM</span><span>Acc</span><span>Score</span>";
  list.appendChild(head);
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No scores yet.";
    list.appendChild(empty);
    return;
  }
  rows.forEach((row, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="rank">${String(i + 1).padStart(2, "0")}</span><span class="tag3">${esc(row.callsign)}</span><span class="wave">${row.round}</span><span class="wpm">${Math.round(row.wpm)}</span><span class="acc">${Math.round(row.accuracy * 100)}%</span><span class="pts">${row.score}</span>`;
    list.appendChild(li);
  });
}

function renderBoardError(list: HTMLElement): void {
  list.replaceChildren();
  const empty = document.createElement("li");
  empty.className = "empty";
  empty.textContent = "Couldn't load scores.";
  list.appendChild(empty);
}

async function loadBoard(period: ScorePeriod, target: HTMLElement): Promise<void> {
  try {
    const { scores } = await fetchScores(period);
    renderBoard(target, scores);
  } catch {
    renderBoardError(target);
  }
}

export function mountShell(app: GameApp): void {
  const menu = $("screen-menu");
  const results = $("screen-results");
  const pause = $("screen-pause");
  const boardAlltime = $("board-alltime");
  const boardToday = $("board-today");
  const resultsAlltime = $("results-alltime");
  const resultsToday = $("results-today");
  const laneLabel = playPlatform() === "mobile" ? "Mobile board" : "Desktop board";
  $("board-title").textContent = laneLabel;
  $("results-lane").textContent = laneLabel;
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

  musicBtn.addEventListener("click", () => {
    void unlockAudio();
    setMusicOn(!isMusicOn());
    musicBtn.textContent = isMusicOn() ? "Music on" : "Music off";
    sfxUi();
  });

  const start = () => {
    void unlockAudio();
    setBed();
    sfxUi();
    show(menu, false);
    show(results, false);
    show(pause, false);
    setKeyboard(true);
    wordLayer.clear();
    app.startPlay(randomSeed());
  };

  $("btn-play").addEventListener("click", start);

  $("btn-resume").addEventListener("click", () => {
    sfxUi();
    app.play?.resumePlay();
  });

  $("btn-abort").addEventListener("click", () => {
    sfxUi();
    app.play?.abortRun();
  });

  const toMenu = () => {
    hideHud();
    setKeyboard(false);
    wordLayer.clear();
    show(results, false);
    show(pause, false);
    show(menu, true);
    app.stopPlay();
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
    app.stopPlay();
    $("res-score").textContent = String(run.score);
    $("res-round").textContent = String(run.round);
    $("res-wpm").textContent = String(Math.round(run.wpm));
    $("res-acc").textContent = `${Math.round(run.accuracy * 100)}%`;
    $("res-streak").textContent = String(run.bestStreak);
    $("results-eyebrow").textContent = "HULL BREACHED";
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
      submitNote.textContent = err instanceof Error ? err.message : "Couldn't save score.";
      submitBtn.disabled = false;
    }
  });
}
