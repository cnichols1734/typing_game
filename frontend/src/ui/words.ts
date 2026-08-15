import type { Bolt } from "../game/entities/Bolt";
import type { Contact } from "../game/entities/Contact";

export class WordLayer {
  private readonly root: HTMLElement;
  private readonly nodes = new Map<string, HTMLSpanElement>();
  private canvas: HTMLCanvasElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  bind(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  sync(contacts: Contact[], locked: Contact | null, focus: boolean, gw = 1, gh = 1, bolts: Bolt[] = []): void {
    const live = new Set<string>();
    const rect = this.canvas?.getBoundingClientRect();
    const scaleX = rect ? rect.width / gw : 1;
    const scaleY = rect ? rect.height / gh : 1;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;

    const place = (id: string, x: number, y: number, html: string, cls: (el: HTMLSpanElement) => void) => {
      live.add(id);
      let el = this.nodes.get(id);
      if (!el) {
        el = document.createElement("span");
        el.className = "word";
        this.root.appendChild(el);
        this.nodes.set(id, el);
      }
      el.innerHTML = html;
      cls(el);
      const wordW = el.offsetWidth || 36;
      const minX = wordW / 2 + 8;
      const maxX = window.innerWidth - wordW / 2 - 8;
      el.style.left = `${maxX > minX ? Math.min(Math.max(left + x * scaleX, minX), maxX) : window.innerWidth / 2}px`;
      el.style.top = `${top + y * scaleY}px`;
    };

    for (const c of contacts) {
      const typed = c.word.slice(0, c.typed);
      const next = c.word.slice(c.typed, c.typed + 1);
      const rest = c.word.slice(c.typed + 1);
      place(c.id, c.x, c.y, `<span class="done">${typed}</span><span class="next">${next}</span>${rest}`, (el) => {
        el.classList.toggle("bolt", false);
        el.classList.toggle("supply", c.hull === "supply");
        el.classList.toggle("locked", locked === c);
        el.classList.toggle("error", c.errors > 0);
        el.classList.toggle("focus", focus && locked === c);
        el.classList.toggle("dim", focus && locked !== null && locked !== c);
      });
    }

    for (const b of bolts) {
      const letter = b.letter.toUpperCase();
      place(b.id, b.x, b.y, `<span class="next">${letter}</span>`, (el) => {
        el.classList.toggle("bolt", true);
        el.classList.toggle("supply", false);
        el.classList.toggle("locked", false);
        el.classList.toggle("error", false);
        el.classList.toggle("focus", false);
        el.classList.toggle("dim", false);
      });
    }

    for (const [id, el] of this.nodes) {
      if (!live.has(id)) {
        el.remove();
        this.nodes.delete(id);
      }
    }
  }

  clear(): void {
    this.root.replaceChildren();
    this.nodes.clear();
  }
}
