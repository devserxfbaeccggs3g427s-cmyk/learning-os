"use client";
import { useEffect } from "react";

/**
 * ThemeProvider applies the user's chosen theme to the html element. We avoid
 * a heavy theme library because the requirements are simple.
 *
 * Resolution order:
 *   1. localStorage["theme"] = "light" | "dark"
 *   2. Otherwise: respects OS preference via `system` (default).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("theme")) || null;
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const isDark = stored ? stored === "dark" : Boolean(prefersDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  return <>{children}</>;
}

export function setTheme(value: "light" | "dark" | "system") {
  if (typeof window === "undefined") return;
  if (value === "system") {
    localStorage.removeItem("theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", Boolean(prefersDark));
  } else {
    localStorage.setItem("theme", value);
    document.documentElement.classList.toggle("dark", value === "dark");
  }
}