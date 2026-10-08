"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@shell/components/shell-ui/button"
import { cn } from "@shell/lib/utils"

/**
 * The standard Monark theme toggle (brand guidelines §10): a 36px ghost icon
 * button, moon in light mode, sun in dark mode. The icons swap with CSS, so
 * there is no hydration flash.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-9", className)}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <Sun className="hidden size-[18px] dark:block" aria-hidden="true" />
      <Moon className="size-[18px] dark:hidden" aria-hidden="true" />
    </Button>
  )
}
