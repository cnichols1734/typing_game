import { isPhone, syncChrome } from "../game/systems/layout";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

let lastKey = "";
let lastAt = 0;

function fire(key: string): void {
  const now = performance.now();
  if (key === lastKey && now - lastAt < 90) return;
  lastKey = key;
  lastAt = now;
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  if (navigator.vibrate) navigator.vibrate(8);
}

function keyEl(label: string, key: string, extra = ""): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = extra ? `key ${extra}` : "key";
  btn.textContent = label;
  btn.setAttribute("aria-label", label);
  const press = (e: Event) => {
    e.preventDefault();
    fire(key);
  };
  btn.addEventListener("pointerdown", press);
  btn.addEventListener("click", press);
  return btn;
}

export function mountKeyboard(): void {
  const root = document.getElementById("deck-keys");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "1";

  for (const row of ROWS) {
    const line = document.createElement("div");
    line.className = "key-row";
    if (row === "asdfghjkl") line.classList.add("inset");
    if (row === "zxcvbnm") line.classList.add("inset-more");
    for (const ch of row) line.appendChild(keyEl(ch, ch));
    root.appendChild(line);
  }

  const util = document.createElement("div");
  util.className = "key-row util";
  util.appendChild(keyEl("ORDNANCE", "Tab", "wide brass"));
  util.appendChild(keyEl("PAUSE", "Escape", "wide"));
  root.appendChild(util);

  window.addEventListener("resize", syncChrome);
  syncChrome();
}

export function setKeyboard(on: boolean): void {
  const root = document.getElementById("deck-keys");
  if (!root) return;
  const show = on && isPhone();
  root.hidden = !show;
  document.documentElement.classList.toggle("keys-up", show);
  syncChrome();
}
