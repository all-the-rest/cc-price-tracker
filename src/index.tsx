import { hydrate, render } from "solid-js/web";
import App from "./App";
import "./index.css";

const root = document.getElementById("root");
if (root) {
  // Beim Build vorgerendert (scripts/prerender.mjs) → hydratisieren.
  // Ohne vorgerendertes Markup (z. B. Vite-Dev-Server) normal rendern.
  if (root.firstChild) {
    // Solid-`hydrate` erwartet das globale `_$HY`-Objekt (sonst per
    // HydrationScript im Head gesetzt) — hier absichern, damit es auch ohne
    // dieses Script funktioniert.
    const g = globalThis as typeof globalThis & { _$HY?: unknown };
    g._$HY ??= { events: [], completed: new WeakSet(), r: {}, fe() {} };
    hydrate(() => <App />, root);
  } else {
    render(() => <App />, root);
  }
}
