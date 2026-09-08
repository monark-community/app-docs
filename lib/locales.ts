/**
 * Client-safe accessors for the locale list the header's toggle offers.
 * Empty in single-locale mode — the toggle hides itself.
 */
import { configuredLocales, defaultLocale } from "@shell/lib/config"

export function getShellLocales(): string[] {
  return configuredLocales
}

export function getShellDefaultLocale(): string {
  return defaultLocale
}
