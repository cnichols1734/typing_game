import Phaser from "phaser";
import "./style.css";
import { BootScene } from "./game/scenes/BootScene";
import { MenuScene } from "./game/scenes/MenuScene";
import { PlayScene } from "./game/scenes/PlayScene";
import { syncChrome } from "./game/systems/layout";
import { mountHud } from "./ui/hud";
import { mountKeyboard } from "./ui/keyboard";
import { mountShell } from "./ui/screens";

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: "game",
  backgroundColor: "#140f0b",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  render: {
    antialias: true,
    powerPreference: "high-performance",
    roundPixels: false,
  },
  scene: [BootScene, MenuScene, PlayScene],
  banner: false,
});

syncChrome();
mountKeyboard();
mountHud();
mountShell(game);
