import { PlayScene } from "./scenes/PlayScene";
import { Battlefield } from "./world/Battlefield";
import { wordLayer } from "../ui/layer";

export class GameApp {
  readonly world: Battlefield;
  play: PlayScene | null = null;

  constructor(host: HTMLElement) {
    this.world = new Battlefield(host);
    wordLayer.bind(this.world.canvas);
    this.world.startLoop((dt) => this.play?.update(dt));
  }

  startPlay(seed: string): void {
    this.play?.dispose();
    this.play = new PlayScene(this.world);
    this.play.start({ mode: "arcade", seed });
  }

  stopPlay(): void {
    this.play?.dispose();
    this.play = null;
    this.world.layoutDeck();
  }
}
