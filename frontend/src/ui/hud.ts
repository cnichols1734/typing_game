import { bus } from "../game/systems/bus";
import { POWER_LINE, SALVO_MAX } from "../game/systems/copy";
import type { HudState } from "../game/types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function mountHud(): void {
  const hud = document.getElementById("hud")!;
  const score = document.getElementById("hud-score")!;
  const mult = document.getElementById("hud-mult")!;
  const streak = document.getElementById("hud-streak")!;
  const ribbon = document.getElementById("combo-ribbon")!;
  const wpm = document.getElementById("hud-wpm")!;
  const round = document.getElementById("hud-round")!;
  const shields = document.getElementById("hud-shields")!;
  const salvo = document.getElementById("hud-salvo")!;
  const powers = document.getElementById("power-row")!;
  const banner = document.getElementById("banner")!;
  const title = document.getElementById("banner-title")!;
  const sub = document.getElementById("banner-sub")!;
  const flash = document.getElementById("flash")!;

  bus.on("hud", (s: HudState) => {
    hud.hidden = false;
    score.textContent = String(s.score);
    mult.textContent = `×${s.multiplier.toFixed(1)}`;
    streak.textContent = String(s.streak);
    ribbon.classList.toggle("hot", s.streak >= 8);
    wpm.textContent = String(Math.round(s.wpm));
    round.textContent = pad(s.round);
    shields.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const pip = document.createElement("span");
      pip.className = "pip";
      if (i >= s.shields) pip.classList.add("off");
      shields.appendChild(pip);
    }
    if (s.aegis) {
      const pip = document.createElement("span");
      pip.className = "pip aegis";
      shields.appendChild(pip);
    }
    salvo.replaceChildren();
    for (let i = 0; i < SALVO_MAX; i++) {
      const shell = document.createElement("span");
      shell.className = i < s.salvo ? "shell" : "shell off";
      salvo.appendChild(shell);
    }
    powers.replaceChildren();
    for (const p of s.powers) {
      const chip = document.createElement("span");
      chip.className = "power-chip";
      chip.textContent = p.remain >= 30 ? POWER_LINE[p.id] : `${POWER_LINE[p.id]} · ${Math.ceil(p.remain)}s`;
      powers.appendChild(chip);
    }
  });

  bus.on("banner", (msg) => {
    banner.hidden = false;
    banner.classList.remove("run");
    void banner.offsetWidth;
    banner.classList.add("run");
    title.textContent = msg.title;
    sub.textContent = msg.sub ?? "";
    sub.hidden = !msg.sub;
    window.setTimeout(() => {
      banner.hidden = true;
    }, 2200);
  });

  bus.on("flash", (kind) => {
    flash.className = kind === "ok" ? "ok" : "on";
    flash.classList.add("on");
    window.setTimeout(() => {
      flash.className = "";
    }, 220);
  });
}

export function hideHud(): void {
  const hud = document.getElementById("hud");
  if (hud) hud.hidden = true;
}
