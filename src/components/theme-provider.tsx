"use client";

/**
 * Minimal theme system replacing the unmaintained `next-themes`.
 *
 * next-themes renders its FOUC-prevention <script> inside a React component,
 * which React 19.2 / Next 16 reports as a console error. Here the script is
 * injected into the SSR stream via useServerInsertedHTML — outside the React
 * tree — so hydration never sees a script element.
 *
 * API subset used by this app: ThemeProvider (class-based, system-aware) and
 * useTheme() -> { theme, resolvedTheme, setTheme }.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { useServerInsertedHTML } from "next/navigation";

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "theme";
const THEMES: readonly Resolved[] = ["light", "dark"];

/** Runs pre-paint on the client; sets the .dark class + color-scheme before hydration. */
const INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(STORAGE_KEY)},d=document.documentElement,c=${JSON.stringify(THEMES)};var t=null;try{t=localStorage.getItem(k)}catch(e){}if(t!=="light"&&t!=="dark")t="system";var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;d.classList.remove.apply(d.classList,c);if(r){d.classList.add(r);d.style.colorScheme=r}}catch(e){}})()`;

function resolveClient(theme: Theme): Resolved {
  if (theme !== "system") return theme;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(resolved: Resolved) {
  const el = document.documentElement;
  el.classList.remove(...THEMES);
  el.classList.add(resolved);
  el.style.colorScheme = resolved;
}

function disableTransitionsTemporarily(apply: () => void) {
  const style = document.createElement("style");
  style.textContent = "*, *::before, *::after { transition: none !important; }";
  document.head.appendChild(style);
  apply();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => style.remove()),
  );
}

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: Resolved;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Injected into the server HTML stream outside the component tree — no
  // React-managed <script>, no React 19 warning.
  useServerInsertedHTML(() => (
    <script dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />
  ));

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === "undefined") return "system";
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "light" || stored === "dark" ? stored : "system";
    } catch {
      return "system";
    }
  });
  const [systemDark, setSystemDark] = useState<boolean | null>(() =>
    typeof document === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue === "light" || e.newValue === "dark" ? e.newValue : "system";
      setThemeState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Keep the DOM class in sync with React state (external-system write).
  const resolvedTheme: Resolved = theme !== "system"
    ? theme
    : systemDark === null ? resolveClient("system") : systemDark ? "dark" : "light";

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    disableTransitionsTemporarily(() => applyTheme(resolveClient(next)));
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
