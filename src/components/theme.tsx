"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

const OPTIONS = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
] as const;

const noop = () => () => {};

/** Light, dark or follow the device. */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  // The saved choice is only known in the browser; render it after hydration.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return (
    <div className="inline-flex rounded-full border p-0.5" role="group" aria-label="Appearance">
      {OPTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={mounted && theme === id}
          onClick={() => setTheme(id)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            mounted && theme === id && "bg-secondary text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
