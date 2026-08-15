import "./style.css";
import { GameApp } from "./game/app";
import { syncChrome } from "./game/systems/layout";
import { mountHud } from "./ui/hud";
import { mountKeyboard } from "./ui/keyboard";
import { mountShell } from "./ui/screens";

const host = document.getElementById("game");
if (!host) throw new Error("#game missing");

const app = new GameApp(host);

syncChrome();
window.addEventListener("resize", syncChrome);
mountKeyboard();
mountHud();
mountShell(app);
