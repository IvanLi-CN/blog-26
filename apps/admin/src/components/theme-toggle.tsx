import { Check, MonitorCog, MoonStar, SunMedium } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { UiThemeSelection } from "@/config/site";
import { cn } from "@/lib/utils";
import { useThemePreference } from "~/components/theme-provider";
import { Button } from "~/components/ui";

const options: Array<{
  value: UiThemeSelection;
  label: string;
  icon: typeof SunMedium;
}> = [
  { value: "light", label: "浅色", icon: SunMedium },
  { value: "dark", label: "深色", icon: MoonStar },
  { value: "system", label: "跟随系统", icon: MonitorCog },
];

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useThemePreference();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const ActiveIcon = useMemo(() => {
    if (theme === "system") return MonitorCog;
    return resolvedTheme === "dark" ? MoonStar : SunMedium;
  }, [resolvedTheme, theme]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setOpen((current) => !current)}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        aria-label={`切换后台主题（当前：${theme === "system" ? "跟随系统" : resolvedTheme === "dark" ? "深色" : "浅色"}）`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="切换后台主题"
        className="size-9 rounded-full bg-background/88 shadow-sm backdrop-blur"
      >
        <ActiveIcon className="size-4 text-primary" />
      </Button>

      <div
        className={cn(
          "absolute right-0 top-full z-30 mt-2 w-44 rounded-2xl border border-border bg-card/96 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur transition-all",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        )}
        role="menu"
        aria-label="后台主题菜单"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {options.map(({ value, label, icon: Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0 text-primary" />
              <span className="flex-1">{label}</span>
              <Check className={cn("size-4", active ? "opacity-100" : "opacity-0")} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
