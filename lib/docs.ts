/**
 * Server-side docs loader. Walks the MDX tree under `content/docs/` and
 * turns it into the nav model the shell renders:
 *
 *     content/docs/<section>/[<group>/]<name>.mdx  →  /docs/<section>/[<group>/]<name>
 *
 * The first directory level is a **section** (a header tab); any further
 * nesting is a **group** (a collapsible heading inside the section's
 * sidebar). Locale variants sit beside the canonical file as
 * `<name>.<locale>.mdx`.
 *
 * Everything is read from disk at module init and the results are cached for
 * the process — the site is a static export, so this runs at build time and
 * never on a request path.
 */
// Deliberately no `server-only` guard: `scripts/generate-search-index.ts`
// imports this module from plain Node to bake the search index, and that
// package throws outside a React-server graph. Importing it from a client
// component fails the build anyway — `node:fs` can't be bundled.
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import {
  DOCS_ROOT,
  declaredSections,
  defaultLocale,
  multilocale,
  titleCase,
} from "@shell/lib/config"
import type { DocContent, DocMeta, DocSection } from "@shell/lib/types"

export type { DocMeta, DocSection }

const root = path.join(process.cwd(), DOCS_ROOT)

/** `foo.fr.mdx` → `{ name: "foo", locale: "fr" }` ; `foo.mdx` → locale null. */
function parseFilename(filename: string): { name: string; locale: string | null } | null {
  if (!filename.endsWith(".mdx")) return null
  const base = filename.slice(0, -".mdx".length)
  const dot = base.lastIndexOf(".")
  // A trailing `.xx` / `.xx-YY` segment is a locale ; anything else is part
  // of the name (so `use-cases.v2.mdx` doesn't become locale "v2").
  if (multilocale && dot > 0) {
    const tail = base.slice(dot + 1)
    if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(tail)) {
      return { name: base.slice(0, dot), locale: tail }
    }
  }
  return { name: base, locale: null }
}

interface DocFile {
  /** Absolute path of the canonical (default-locale) file. */
  file: string
  meta: DocMeta
}

function walk(dir: string, relative: string[], out: DocFile[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort()) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(abs, [...relative, entry.name], out)
      continue
    }
    const parsed = parseFilename(entry.name)
    // Locale variants are discovered from the canonical file, not listed as
    // pages of their own.
    if (!parsed || parsed.locale) continue

    const { data } = matter(fs.readFileSync(abs, "utf-8"))
    // A folder's `_index` / `index` file *is* that folder: it answers at the
    // folder's own URL (`/docs/user-guide`) rather than at a child path, the
    // way Hugo's `_index.md` does. Keeps section landing pages addressable
    // without a redundant segment.
    const isFolderIndex = parsed.name === "_index" || parsed.name === "index"
    const slugParts = isFolderIndex ? relative : [...relative, parsed.name]
    const [section = "", ...rest] = relative
    if (slugParts.length === 0) continue // an index at the very root has no URL
    const title = typeof data.title === "string" ? data.title : titleCase(parsed.name)

    out.push({
      file: abs,
      meta: {
        slug: slugParts.join("/"),
        section,
        group: rest.join("/"),
        title,
        description: typeof data.description === "string" ? data.description : "",
        order: typeof data.order === "number" ? data.order : 999,
        titles: { [defaultLocale]: title, ...localeTitles(abs, parsed.name) },
      },
    })
  }
}

/** Titles of a doc's locale variants, keyed by locale. */
function localeTitles(canonical: string, name: string): Record<string, string> {
  if (!multilocale) return {}
  const dir = path.dirname(canonical)
  const out: Record<string, string> = {}
  for (const filename of fs.readdirSync(dir)) {
    const parsed = parseFilename(filename)
    if (!parsed || !parsed.locale || parsed.name !== name) continue
    const { data } = matter(fs.readFileSync(path.join(dir, filename), "utf-8"))
    if (typeof data.title === "string") out[parsed.locale] = data.title
  }
  return out
}

const files: DocFile[] = []
if (fs.existsSync(root)) walk(root, [], files)

const sections: DocSection[] = (() => {
  const declared = new Map(declaredSections.map((s) => [s.dir, s]))
  const found = [...new Set(files.map((f) => f.meta.section))].filter(Boolean)
  // Declared sections keep their config order ; anything else found on disk
  // is appended alphabetically so new content is reachable before someone
  // remembers to declare it.
  const extra: DocSection[] = found
    .filter((dir) => !declared.has(dir))
    .sort()
    .map((dir, i) => ({
      dir,
      label: titleCase(dir),
      order: declared.size + i,
      icon: "BookOpen",
    }))
  return [...declaredSections.filter((s) => found.includes(s.dir)), ...extra].sort(
    (a, b) => a.order - b.order,
  )
})()

const sectionOrder = new Map(sections.map((s) => [s.dir, s.order]))

const docs: DocMeta[] = files
  .map((f) => f.meta)
  .sort((a, b) => {
    const bySection = (sectionOrder.get(a.section) ?? 999) - (sectionOrder.get(b.section) ?? 999)
    if (bySection !== 0) return bySection
    if (a.group !== b.group) return a.group.localeCompare(b.group)
    if (a.order !== b.order) return a.order - b.order
    return a.title.localeCompare(b.title)
  })

const bySlug = new Map(files.map((f) => [f.meta.slug, f]))

export function getSections(): DocSection[] {
  return sections
}

export function getAllDocs(): DocMeta[] {
  return docs
}

/** Docs belonging to one section, in sidebar order. */
export function getSectionDocs(section: string): DocMeta[] {
  return docs.filter((d) => d.section === section)
}

export function getDocBySlug(slug: string, locale?: string): DocContent | null {
  const entry = bySlug.get(slug)
  if (!entry) return null

  const { titles: _titles, ...meta } = entry.meta
  const wanted = locale && locale !== defaultLocale ? localeFile(entry.file, locale) : null
  const file = wanted ?? entry.file
  return { meta, content: matter(fs.readFileSync(file, "utf-8")).content }
}

/** Every locale's body for one doc, keyed by locale. */
export function getDocAllLocales(slug: string): Record<string, string> {
  const entry = bySlug.get(slug)
  if (!entry) return {}

  const out: Record<string, string> = {
    [defaultLocale]: matter(fs.readFileSync(entry.file, "utf-8")).content,
  }
  if (!multilocale) return out

  const dir = path.dirname(entry.file)
  const name = path.basename(entry.file, ".mdx")
  for (const filename of fs.readdirSync(dir)) {
    const parsed = parseFilename(filename)
    if (!parsed || !parsed.locale || parsed.name !== name) continue
    out[parsed.locale] = matter(fs.readFileSync(path.join(dir, filename), "utf-8")).content
  }
  return out
}

function localeFile(canonical: string, locale: string): string | null {
  const dir = path.dirname(canonical)
  const name = path.basename(canonical, ".mdx")
  const candidate = path.join(dir, `${name}.${locale}.mdx`)
  return fs.existsSync(candidate) ? candidate : null
}
