import { createContext, createSignal, onCleanup, onMount, useContext, type JSX } from "solid-js";
import { normalizePath } from "./routes";

interface RouterCtx {
  path: () => string;
  navigate: (to: string) => void;
  replace: (to: string) => void;
}

const Ctx = createContext<RouterCtx>();

/**
 * Minimaler SPA-Router für die statisch vorgerenderten Routen.
 *
 * Der initiale Pfad kommt beim Server-Render aus `renderRoute(path, …)` und beim
 * Client synchron aus `window.location.pathname` — dadurch stimmt der erste
 * Client-Render exakt mit der jeweiligen vorgerenderten HTML-Datei überein
 * (Hydration). Query-Parameter werden nicht im Signal gehalten; sie bleiben
 * Eigentum der bestehenden `replaceState`-Synchronisierung in `App.tsx`.
 */
export function RouterProvider(props: { initialPath: string; children: JSX.Element }) {
  const [path, setPath] = createSignal(normalizePath(props.initialPath));

  const navigate = (to: string) => {
    if (typeof window === "undefined") return;
    if (normalizePath(to) === path()) return;
    window.history.pushState(null, "", to);
    setPath(normalizePath(to));
    window.scrollTo({ top: 0 });
  };

  const replace = (to: string) => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", to);
    setPath(normalizePath(to));
  };

  onMount(() => {
    const onPop = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    onCleanup(() => window.removeEventListener("popstate", onPop));
  });

  return <Ctx.Provider value={{ path, navigate, replace }}>{props.children}</Ctx.Provider>;
}

export function useRouter(): RouterCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRouter must be used within RouterProvider");
  return ctx;
}
