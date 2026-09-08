/**
 * Writes `public/api/search-index.json` — what the header's search dialog
 * fetches on mount.
 *
 * Indexed by **section**, not by page: every heading in every doc becomes its
 * own record, carrying the prose under it up to the next heading. Titles alone
 * are a table of contents, not a search index; someone looking for "recovery
 * codes" or "WIP limit" is looking for a paragraph, and a title-only index
 * can only find those words if they happen to be in a heading.
 *
 * Each record links to the heading's anchor, so a hit lands on the passage
 * rather than at the top of a long page. Anchors are generated with the same
 * `slugify` the MDX renderer uses (components/heading-anchor.tsx) — if that
 * changes, this must change with it or every deep link silently misses.
 *
 * Baked at build time rather than served from a route handler because the site
 * is a static export: there is no server to answer `/api/*` at runtime. Runs
 * from `predev` / `prebuild`, so the index can't drift from the content in a
 * normal workflow.
 */
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { getAllDocs, getSections } from "@shell/lib/docs"
import { DOCS_ROOT } from "@shell/lib/config"

interface SearchItem {
  /** Heading text, or the page title for a page's opening record. */
  label: string
  /** Page title. Shown under the label so a section hit says where it lives. */
  page: string
  href: string
  group: string
  /** Prose under this heading, flattened and capped. Matched and excerpted. */
  text: string
}

/** Mirrors `slugify` in components/heading-anchor.tsx. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
}

/**
 * Markdown → plain text, for matching and for the excerpt shown in a result.
 * Deliberately lossy: code fences go entirely (a search hit inside a code
 * sample reads as noise in a one-line excerpt), links keep their text, and the
 * remaining inline markers are stripped.
 */
function flatten(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ") // table rows
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[`*_#]/g, "")
    .replace(/\\([<{])/g, "$1") // undo the MDX escaping the sync applies
    .replace(/\s+/g, " ")
    .trim()
}

/** Long enough to match on and to excerpt from; short enough to ship. */
const MAX_TEXT = 600

const sections = new Map(getSections().map((s) => [s.dir, s.label]))
const root = path.join(process.cwd(), DOCS_ROOT)

const items: SearchItem[] = []

for (const doc of getAllDocs()) {
  const file = path.join(root, `${doc.slug}.mdx`)
  const indexFile = path.join(root, doc.slug, "_index.mdx")
  const source = fs.existsSync(file) ? file : indexFile
  if (!fs.existsSync(source)) continue

  const { content } = matter(fs.readFileSync(source, "utf-8"))
  const group = sections.get(doc.section) ?? "Documentation"
  const href = `/docs/${doc.slug}/`

  // Split on ATX headings, keeping each heading with the prose beneath it.
  // The text before the first heading (or under the page's H1) becomes the
  // page's own record, so a page is findable by its opening paragraph too.
  const parts = content.split(/^(#{1,4})\s+(.+?)\s*$/m)
  const intro = flatten(parts[0] ?? "")
  items.push({
    label: doc.title,
    page: doc.title,
    href,
    group,
    text: (doc.description ? `${doc.description} ` : "") + intro.slice(0, MAX_TEXT),
  })

  for (let i = 1; i < parts.length; i += 3) {
    const level = (parts[i] ?? "").length
    const heading = (parts[i + 1] ?? "").trim()
    const body = flatten(parts[i + 2] ?? "")
    if (!heading) continue
    // The H1 is the page title, which the page record above already carries.
    if (level === 1) continue
    // A heading whose slug is empty (punctuation only) can't be linked to;
    // fold its text into the page record rather than dropping it.
    const anchor = slugify(heading)
    items.push({
      label: heading,
      page: doc.title,
      href: anchor ? `${href}#${anchor}` : href,
      group,
      text: body.slice(0, MAX_TEXT),
    })
  }
}

const outDir = path.join(process.cwd(), "public", "api")
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, "search-index.json")
fs.writeFileSync(outPath, JSON.stringify(items), "utf-8")

const kb = (fs.statSync(outPath).size / 1024).toFixed(0)
console.log(
  `[search-index] wrote ${items.length} record(s), ${kb}KB → ${path.relative(process.cwd(), outPath)}`,
)
