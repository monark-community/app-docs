import type { BrandingConfig } from "@shell/lib/types"

/**
 * Everything a downstream team edits to rebrand this site. One file, no code
 * changes: [docs.config.ts](../docs.config.ts) at the project root.
 *
 * Kept free of `node:` imports on purpose — both the server layout and client
 * components (header, sidebar, search) read the resolved config, so it has to
 * survive being bundled into the browser.
 */

/** Filesystem locations the docs loader scans. Relative to the project root. */
export interface DocsPaths {
  /** Root of the MDX tree. Default: `"content/docs"`. */
  docs?: string
}

/** Declaration for one top-level docs section. */
export interface SectionConfig {
  /** Directory name under the docs root. Also the first URL segment. */
  dir: string
  /** Tab + sidebar label. Defaults to a title-cased `dir`. */
  label?: string
  /**
   * Lucide icon name for the sidebar heading (e.g. `"BookOpen"`, `"Boxes"`).
   * Unknown names fall back to `"BookOpen"`. Default: `"BookOpen"`.
   */
  icon?: string
}

export interface DocsConfig {
  /** Required. Displayed in the site chrome and metadata. */
  branding: BrandingConfig

  /**
   * Ordered list of docs sections — the header tabs, left to right. A
   * directory under the docs root that isn't declared here still renders
   * (title-cased, after the declared ones), so adding content never 404s
   * just because the config wasn't updated.
   */
  sections?: SectionConfig[]

  /** Optional filesystem overrides. */
  paths?: DocsPaths

  /**
   * When `true`, locale variants live beside each doc as
   * `{name}.{locale}.mdx` and the header shows a locale toggle. The
   * canonical file (`{name}.mdx`) is `defaultLocale`.
   */
  multilocale?: boolean

  /** Canonical locale of the un-suffixed files. Default: `"en"`. */
  defaultLocale?: string

  /**
   * Locale codes offered in the toggle, e.g. `["en", "fr"]`. Required in
   * multilocale mode : the list is read by client components, so it has to
   * be declared rather than discovered on disk.
   */
  locales?: string[]

  /** Locale → key → value dictionaries merged into the built-in i18n table. */
  extraTranslations?: Record<string, Record<string, string>>
}

/**
 * Identity function with type inference — called purely for editor support.
 */
export function defineConfig(config: DocsConfig): DocsConfig {
  return config
}
