import type { Banner, HudState, RunSummary } from "../types";

type Catalog = {
  hud: HudState;
  banner: Banner;
  gameover: RunSummary;
  flash: "hit" | "ok";
  abort: null;
};

class Bus extends EventTarget {
  emit<K extends keyof Catalog>(type: K, detail: Catalog[K]): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on<K extends keyof Catalog>(type: K, fn: (detail: Catalog[K]) => void): () => void {
    const handler = (e: Event) => fn((e as CustomEvent<Catalog[K]>).detail);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }
}

export const bus = new Bus();
