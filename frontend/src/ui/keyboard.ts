import { isPhone, syncChrome } from "../game/systems/layout";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

type Pad = { el: HTMLButtonElement; key: string };

let root: HTMLElement | null = null;
const pads: Pad[] = [];
let pointerId: number | null = null;
let hover: Pad | null = null;
let lastPointerAt = 0;
let iosSwitch: HTMLLabelElement | null = null;

function haptic(): void {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(12);
  } catch {
    /* Android Chrome only; Safari has no Vibration API. */
  }

  // iOS 17.4–26.4: toggling a native switch during a user gesture ticks the Taptic Engine.
  // iOS 26.5+ patched programmatic clicks; this becomes a no-op there.
  try {
    if (!/iP(hone|ad|od)/.test(navigator.userAgent)) return;
    if (!iosSwitch) {
      iosSwitch = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.tabIndex = -1;
      input.setAttribute("switch", "");
      iosSwitch.appendChild(input);
      iosSwitch.setAttribute("aria-hidden", "true");
      iosSwitch.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none;overflow:hidden;";
      document.body.appendChild(iosSwitch);
    }
    iosSwitch.click();
  } catch {
    /* ignore */
  }
}

function light(pad: Pad | null): void {
  if (hover === pad) return;
  hover?.el.classList.remove("hot");
  hover = pad;
  hover?.el.classList.add("hot");
}

function padAt(x: number, y: number): Pad | null {
  if (!root || !pads.length) return null;
  const deck = root.getBoundingClientRect();
  if (x < deck.left - 10 || x > deck.right + 10 || y < deck.top - 10 || y > deck.bottom + 10) {
    return null;
  }

  let best: Pad | null = null;
  let bestD = Infinity;
  for (const pad of pads) {
    const r = pad.el.getBoundingClientRect();
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    const edge = Math.hypot(dx, dy);
    const d = inside ? Math.hypot(x - cx, y - cy) * 0.01 : 1 + edge;
    if (d < bestD) {
      bestD = d;
      best = pad;
    }
  }
  return best;
}

function commit(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function releasePointer(): void {
  if (pointerId !== null && root?.hasPointerCapture(pointerId)) {
    try {
      root.releasePointerCapture(pointerId);
    } catch {
      /* already released */
    }
  }
  pointerId = null;
  light(null);
}

function onDown(e: PointerEvent): void {
  if (!root || pointerId !== null) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  pointerId = e.pointerId;
  try {
    root.setPointerCapture(e.pointerId);
  } catch {
    /* pointer already ended */
  }
  const pad = padAt(e.clientX, e.clientY);
  light(pad);
  if (pad) haptic();
}

function onMove(e: PointerEvent): void {
  if (e.pointerId !== pointerId) return;
  const pad = padAt(e.clientX, e.clientY);
  const changed = pad !== hover;
  light(pad);
  if (changed && pad) haptic();
}

function onUp(e: PointerEvent): void {
  if (e.pointerId !== pointerId) return;
  e.preventDefault();
  const pad = padAt(e.clientX, e.clientY);
  releasePointer();
  if (!pad) return;
  lastPointerAt = performance.now();
  commit(pad.key);
}

function onCancel(e: PointerEvent): void {
  if (e.pointerId !== pointerId) return;
  releasePointer();
}

function keyEl(label: string, key: string, extra = ""): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = extra ? `key ${extra}` : "key";
  btn.textContent = label;
  btn.tabIndex = -1;
  btn.dataset.key = key;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (pointerId !== null) return;
    if (performance.now() - lastPointerAt < 500) return;
    commit(key);
  });
  return btn;
}

export function mountKeyboard(): void {
  const el = document.getElementById("deck-keys");
  if (!el || el.dataset.ready) return;
  el.dataset.ready = "1";
  root = el;
  pads.length = 0;

  for (const row of ROWS) {
    const line = document.createElement("div");
    line.className = "key-row";
    if (row === "asdfghjkl") line.classList.add("inset");
    if (row === "zxcvbnm") line.classList.add("inset-more");
    for (const ch of row) {
      const btn = keyEl(ch, ch);
      pads.push({ el: btn, key: ch });
      line.appendChild(btn);
    }
    el.appendChild(line);
  }

  const util = document.createElement("div");
  util.className = "key-row util";
  const salvo = keyEl("ORDNANCE", "Tab", "wide brass");
  const pause = keyEl("PAUSE", "Escape", "wide");
  pads.push({ el: salvo, key: "Tab" }, { el: pause, key: "Escape" });
  util.appendChild(salvo);
  util.appendChild(pause);
  el.appendChild(util);

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onCancel);
  el.addEventListener("lostpointercapture", onCancel);
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("resize", syncChrome);
  syncChrome();
}

export function setKeyboard(on: boolean): void {
  const el = document.getElementById("deck-keys");
  if (!el) return;
  const show = on && isPhone();
  el.hidden = !show;
  document.documentElement.classList.toggle("keys-up", show);
  if (!show) releasePointer();
  syncChrome();
}
