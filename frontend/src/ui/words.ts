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

  sync(contacts: Contact[], locked: Contact | null, focus: boolean, gw = 1, gh = 1): void {
    const live = new Set<string>();
    const rect = this.canvas?.getBoundingClientRect();
    const scaleX = rect ? rect.width / gw : 1;
    const scaleY = rect ? rect.height / gh : 1;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;

    for (const c of contacts) {
      live.add(c.id);
      let el = this.nodes.get(c.id);
      if (!el) {
        el = document.createElement("span");
        el.className = "word";
        this.root.appendChild(el);
        this.nodes.set(c.id, el);
      }
      const typed = c.word.slice(0, c.typed);
      const next = c.word.slice(c.typed, c.typed + 1);
      const rest = c.word.slice(c.typed + 1);
      el.innerHTML = `<span class="done">${typed}</span><span class="next">${next}</span>${rest}`;
      el.classList.toggle("locked", locked === c);
      el.classList.toggle("error", c.errors > 0);
      el.classList.toggle("focus", focus && locked === c);
      el.classList.toggle("dim", focus && locked !== null && locked !== c);
      el.style.left = `${left + c.x * scaleX}px`;
      el.style.top = `${top + c.y * scaleY}px`;
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
