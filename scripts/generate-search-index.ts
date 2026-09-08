/**
 * Writes `public/api/search-index.json` — the flat list the header's search
 * dialog fetches on mount.
 *
 * Baked at build time rather than served from a route handler because the
 * site is a static export: there is no server to answer `/api/*` at runtime.
 * Runs from `predev` / `prebuild`, so the index can never drift from the
 * content in a normal workflow.
 */
import fs from "node:fs"
import path from "node:path"
import { getAllDocs, getSections } from "@shell/lib/docs"

interface SearchItem {
  label: string
  href: string
  group: string
}

const sections = new Map(getSections().map((s) => [s.dir, s.label]))

const items: SearchItem[] = getAllDocs().map((doc) => ({
  label: doc.title,
  href: `/docs/${doc.slug}/`,
  // Grouped by section so the dialog's headings match the header's tabs.
  group: sections.get(doc.section) ?? "Documentation",
}))

const outDir = path.join(process.cwd(), "public", "api")
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, "search-index.json")
fs.writeFileSync(outPath, JSON.stringify(items), "utf-8")

console.log(
  `[search-index] wrote ${items.length} item(s) → ${path.relative(process.cwd(), outPath)}`,
)
