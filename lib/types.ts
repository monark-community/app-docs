/**
 * Shared types for the docs shell. Kept free of `node:` imports so client
 * components can import them alongside the server-side loaders.
 */

export interface GithubConfig {
  /** GitHub org or user that owns the documented repo. */
  owner: string
  /** Repo name. */
  repo: string
  /** Button label in the header. Default: `"Github"`. */
  label?: string
  /** Show the public star count (fetched at build time). Default: `true`. */
  showStars?: boolean
}

export interface BrandingConfig {
  /** Full product name, e.g. "Monark Docs". Used in the HTML title. */
  siteName: string
  /** Short breadcrumb label, e.g. "Docs". */
  shortName: string
  /** Canonical URL of the deployed site, e.g. "https://docs.monark.io". */
  siteUrl?: string
  /** SEO meta description. Shown in search results + social cards. */
  description?: string
  /** Path/URL to a 1200×630 Open Graph image. Relative to `siteUrl` if no scheme. */
  ogImage?: string
  /** Twitter handle (without `@`) for Twitter card attribution. */
  twitterHandle?: string
  /** Adds a GitHub link button to the header. Omit to hide the button. */
  github?: GithubConfig
  /** Accessible alt text for the logo image. Default: siteName. */
  logoAlt?: string
  /** Public path to the dark-theme SVG favicon. */
  faviconDark?: string
  /** Public path to the light-theme SVG favicon. */
  faviconLight?: string
  /** Public path to a fallback `.ico` favicon. */
  faviconIco?: string
}

/**
 * One top-level grouping of docs — a directory under `content/docs/`, and a
 * tab in the header. Sections are the site's primary navigation axis: the
 * header switches between them and the sidebar shows the active one.
 */
export interface DocSection {
  /** Directory name under the docs root, e.g. `"user-guide"`. Also the URL segment. */
  dir: string
  /** Sidebar + tab label. Defaults to a title-cased `dir`. */
  label: string
  /** Tab order, low to high. Defaults to the config's declaration order. */
  order: number
  /** Name of the lucide icon shown beside the section heading. */
  icon: string
}

/** Doc page metadata (frontmatter + slug). Drives the sidebar. */
export interface DocMeta {
  /** URL path under `/docs/`, e.g. `"user-guide/getting-started"`. */
  slug: string
  /** Section directory this doc belongs to, or `""` for a root-level doc. */
  section: string
  /**
   * Sub-path between the section and the file, e.g. `"modules"` for
   * `user-guide/modules/calendar.mdx`. Empty for a doc sitting directly in
   * its section. Rendered as a collapsible group in the sidebar.
   */
  group: string
  /** Default-locale title (typically English). */
  title: string
  description: string
  /** Sidebar sort order within its group. Lower = higher up. Default 999. */
  order: number
  /** Per-locale titles, e.g. `{ en: "Getting started", fr: "Démarrage" }`. */
  titles: Record<string, string>
}

/** Full MDX body of a doc for one locale, plus its metadata. */
export interface DocContent {
  meta: Omit<DocMeta, "titles">
  /** Raw MDX string — rendered via `next-mdx-remote`. */
  content: string
}
