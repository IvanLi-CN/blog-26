import { Check, MonitorCog, MoonStar, SunMedium } from "lucide-react";
import { useMemo } from "react";
import type { UiThemeSelection } from "@/config/site";
import { cn } from "@/lib/utils";
import { useThemePreference } from "~/components/theme-provider";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui";

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

  const ActiveIcon = useMemo(() => {
    if (theme === "system") return MonitorCog;
    return resolvedTheme === "dark" ? MoonStar : SunMedium;
  }, [resolvedTheme, theme]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`切换后台主题（当前：${
            theme === "system" ? "跟随系统" : resolvedTheme === "dark" ? "深色" : "浅色"
          }）`}
          title="切换后台主题"
          className="size-11 rounded-full bg-card/78 sm:size-10 lg:size-9"
        >
          <ActiveIcon className="size-4 text-primary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {options.map(({ value, label, icon: Icon }) => {
          const active = theme === value;
          return (
            <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
              <Icon className="size-4 shrink-0 text-primary" />
              <span className="flex-1">{label}</span>
              <Check className={cn("size-4", active ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
