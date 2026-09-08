import config from "@shell/docs.config"
import type { DocSection } from "@shell/lib/types"

/**
 * Resolved view of [docs.config.ts](../docs.config.ts) — defaults applied
 * once, here, so no caller has to `?? fallback` its way through the raw
 * config. Client-safe (see the note in `define-config.ts`).
 */

export const DOCS_ROOT = config.paths?.docs ?? "content/docs"

export const multilocale = config.multilocale ?? false
export const defaultLocale = config.defaultLocale ?? "en"
/** Empty in single-locale mode — the header's locale toggle hides itself. */
export const configuredLocales: string[] = multilocale ? (config.locales ?? []) : []

export const extraTranslations = config.extraTranslations

export function titleCase(dir: string): string {
  return dir
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/**
 * Declared sections, in config order. Directories found on disk that aren't
 * declared are appended by `getSections()` in `lib/docs.ts` — this list is
 * only the part the operator wrote down.
 */
export const declaredSections: DocSection[] = (config.sections ?? []).map((s, i) => ({
  dir: s.dir,
  label: s.label ?? titleCase(s.dir),
  order: i,
  icon: s.icon ?? "BookOpen",
}))

export { config }
