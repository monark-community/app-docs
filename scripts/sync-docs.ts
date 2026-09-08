/**
 * Pulls the documented repository's Markdown into `content/docs/` as MDX.
 *
 *   pnpm sync:docs [--source ../app] [--clean]
 *
 * This is the seam between the two repos: `monark-community/app` owns the
 * prose, this site owns the presentation. Everything the transfer needs to
 * know lives in `MAPPINGS` below — CI runs the same command with a checkout
 * of the source repo, so there is one transform, exercised locally and in
 * the pipeline.
 *
 * What it does per file:
 *   - derives frontmatter (`title` from the first H1, `description` from the
 *     opening paragraph, `order` from the section's `_index.md` when there is
 *     one, else alphabetical),
 *   - rewrites repo-relative `.md` links to site routes,
 *   - escapes the characters MDX would otherwise read as JSX / expressions,
 *   - writes `<section>/<name>.mdx`.
 *
 * Generated output is committed so the site builds from a clean checkout
 * without needing the source repo present.
 */
import fs from "node:fs"
import path from "node:path"

interface Mapping {
  /** Directory in the source repo, relative to its root. */
  from: string
  /** Section directory under `content/docs/`. */
  section: string
  /**
   * `"dir"`  — every `*.md` in `from`.
   * `"glob"` — `from` contains a single `*`, and each match contributes one
   *            file named after the wildcard segment (used for
   *            `packages/<name>/docs/user-guide.md` → `modules/<name>.mdx`).
   */
  kind: "dir" | "glob"
  /** Slugs pinned to the top of the section, in this order, before the rest. */
  pinned?: string[]
}

const MAPPINGS: Mapping[] = [
  { from: "docs/user-guide", section: "user-guide", kind: "dir" },
  {
    from: "packages/*/docs/user-guide.md",
    section: "modules",
    kind: "glob",
  },
  {
    from: "docs/technical-documentation",
    section: "technical-documentation",
    kind: "dir",
    // The platform overview is the "start here" page ; the rest is reference
    // material and sorts alphabetically behind it.
    pinned: ["platform-overview", "architecture", "extensibility-contract"],
  },
]

/** Sections that exist on the site, for resolving cross-section links. */
const SECTION_OF_SOURCE_DIR: Record<string, string> = {
  "docs/user-guide": "user-guide",
  "docs/technical-documentation": "technical-documentation",
}

const args = process.argv.slice(2)
const sourceArg = args.indexOf("--source")
const SOURCE = path.resolve(sourceArg >= 0 ? (args[sourceArg + 1] ?? "") : "../app")
const CLEAN = args.includes("--clean")
const OUT = path.join(process.cwd(), "content", "docs")

if (!fs.existsSync(SOURCE)) {
  console.error(`[sync-docs] source repo not found: ${SOURCE}`)
  console.error("[sync-docs] pass --source <path-to-app-checkout>")
  process.exit(1)
}

/** GitHub URL for content we link to but don't publish. */
const SOURCE_REPO_BLOB = "https://github.com/monark-community/app/blob/develop"

// ── frontmatter derivation ────────────────────────────────────────────────

function firstHeading(md: string): string | null {
  const m = md.match(/^#\s+(.+?)\s*$/m)
  return m?.[1] ?? null
}

/**
 * First real paragraph after the H1, flattened to plain text. Used as the
 * meta description and the search-result subtitle, so it's trimmed to a
 * sentence-ish length rather than dumped whole.
 */
function firstParagraph(md: string): string {
  const body = md.replace(/^#\s+.+?\s*$/m, "")
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.trim()
    if (!text || text.startsWith("#") || text.startsWith("```") || text.startsWith(">")) continue
    if (text.startsWith("-") || text.startsWith("*") || text.startsWith("|")) continue
    const flat = text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → their text
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
    if (flat.length < 20) continue
    return flat.length > 200 ? `${flat.slice(0, 197).trimEnd()}…` : flat
  }
  return ""
}

/**
 * Sidebar order for a section. An `_index.md` is authoritative when present
 * (its link order is the order the author intended a reader to meet the
 * pages); otherwise pinned slugs come first and the rest sort alphabetically.
 */
function sectionOrder(dir: string, slugs: string[], pinned: string[] = []): Map<string, number> {
  const order = new Map<string, number>()
  const indexPath = path.join(dir, "_index.md")

  if (fs.existsSync(indexPath)) {
    order.set("_index", 0)
    let next = 1
    const index = fs.readFileSync(indexPath, "utf-8")
    for (const m of index.matchAll(/\]\(([^)]+?)\.md\)/g)) {
      const slug = path.basename(m[1] ?? "")
      if (slug && slugs.includes(slug) && !order.has(slug)) order.set(slug, next++)
    }
    for (const slug of [...slugs].sort()) if (!order.has(slug)) order.set(slug, next++)
    return order
  }

  let next = 0
  for (const slug of pinned) if (slugs.includes(slug)) order.set(slug, next++)
  for (const slug of [...slugs].sort()) if (!order.has(slug)) order.set(slug, next++)
  return order
}

// ── body transforms ───────────────────────────────────────────────────────

/**
 * Runs `fn` over the prose parts of a document only, leaving fenced blocks
 * and inline code spans untouched. Both transforms below need this: a code
 * sample is exactly where `<Foo>` and `{bar}` are supposed to stay literal.
 */
function mapProse(md: string, fn: (chunk: string) => string): string {
  // Split on fenced blocks first, then on inline code inside the prose parts.
  return md
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part, i) => {
      if (i % 2 === 1) return part // fenced block
      return part
        .split(/(`[^`\n]*`)/g)
        .map((inner, j) => (j % 2 === 1 ? inner : fn(inner)))
        .join("")
    })
    .join("")
}

/**
 * MDX parses `<` as JSX and `{` as an expression, while the source docs are
 * plain Markdown that uses both literally (`packages/<module>/`, `{userId}`).
 * So: rewrite Markdown autolinks into the explicit link form MDX is happy
 * with, then escape every remaining `<` and `{` in prose.
 *
 * Escaping all of them (rather than sparing things that look like HTML tags)
 * is deliberate — the source repo's docs contain no inline HTML, and a
 * pattern that tries to tell `<module>` from `<br>` gets the call wrong on
 * exactly the ambiguous cases that break a build.
 */
function escapeMdx(md: string): string {
  return mapProse(md, (chunk) =>
    chunk
      // `<https://x>` / `<mailto:x>` → `[x](x)`. MDX reads the angle form as
      // JSX and dies on the `//`, but the author meant a link.
      .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, (_m, url: string) => `[${url}](${url})`)
      .replace(/</g, "\\<")
      .replace(/\{/g, "\\{"),
  )
}

/**
 * Repo-relative Markdown links → site routes. A link into content we don't
 * publish (planning specs, source files) becomes an absolute GitHub URL
 * rather than a dead in-site link.
 */
function rewriteLinks(md: string, fromDir: string): string {
  return mapProse(md, (chunk) =>
    chunk.replace(/\]\(([^)\s]+?)(#[^)\s]*)?\)/g, (whole, target: string, hash = "") => {
      if (/^(https?:|mailto:|#)/.test(target)) return whole

      // Resolve against the source file's directory to get a repo-relative path.
      const repoRelative = path
        .normalize(path.join(fromDir, target))
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")

      // A module's user guide lives at packages/<name>/docs/user-guide.md.
      const moduleMatch = repoRelative.match(/^packages\/([^/]+)\/docs\/user-guide\.md$/)
      if (moduleMatch) return `](/docs/modules/${moduleMatch[1]}${hash})`

      if (repoRelative.endsWith(".md")) {
        const dir = path.dirname(repoRelative)
        const name = path.basename(repoRelative, ".md")
        const mapped = SECTION_OF_SOURCE_DIR[dir]
        // `_index.md` is the section's landing page and answers at the
        // section's own URL — see the folder-index rule in `lib/docs.ts`.
        if (mapped) {
          return name === "_index"
            ? `](/docs/${mapped}${hash})`
            : `](/docs/${mapped}/${name}${hash})`
        }
        return `](${SOURCE_REPO_BLOB}/${repoRelative}${hash})`
      }

      // Directory link: point at the section it maps to, else at GitHub.
      const asDir = repoRelative.replace(/\/$/, "")
      const mappedDir = SECTION_OF_SOURCE_DIR[asDir]
      if (mappedDir) return `](/docs/${mappedDir}${hash})`
      return `](${SOURCE_REPO_BLOB}/${asDir}${hash})`
    }),
  )
}

function frontmatter(fields: Record<string, string | number>): string {
  const lines = Object.entries(fields).map(([k, v]) =>
    typeof v === "number" ? `${k}: ${v}` : `${k}: ${JSON.stringify(v)}`,
  )
  return `---\n${lines.join("\n")}\n---\n\n`
}

// ── collection ────────────────────────────────────────────────────────────

interface SourceDoc {
  /** Path of the source `.md`, absolute. */
  file: string
  /** Directory of the source file, relative to the repo root (for links). */
  fromDir: string
  section: string
  slug: string
}

function collect(mapping: Mapping): SourceDoc[] {
  if (mapping.kind === "glob") {
    const [prefix, suffix] = mapping.from.split("*")
    const base = path.join(SOURCE, prefix ?? "")
    if (!fs.existsSync(base)) return []
    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, file: path.join(base, d.name, suffix ?? "") }))
      .filter((c) => fs.existsSync(c.file))
      .map((c) => ({
        file: c.file,
        fromDir: path.relative(SOURCE, path.dirname(c.file)).replace(/\\/g, "/"),
        section: mapping.section,
        slug: c.name,
      }))
  }

  const dir = path.join(SOURCE, mapping.from)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      file: path.join(dir, f),
      fromDir: mapping.from,
      section: mapping.section,
      slug: path.basename(f, ".md"),
    }))
}

// ── run ───────────────────────────────────────────────────────────────────

if (CLEAN && fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true })

let written = 0
for (const mapping of MAPPINGS) {
  const docs = collect(mapping)
  if (docs.length === 0) {
    console.warn(`[sync-docs] no files matched ${mapping.from}`)
    continue
  }

  const order =
    mapping.kind === "dir"
      ? sectionOrder(
          path.join(SOURCE, mapping.from),
          docs.map((d) => d.slug),
          mapping.pinned,
        )
      : sectionOrder("", docs.map((d) => d.slug), mapping.pinned)

  const outDir = path.join(OUT, mapping.section)
  fs.mkdirSync(outDir, { recursive: true })

  for (const doc of docs) {
    const raw = fs.readFileSync(doc.file, "utf-8")
    const title = firstHeading(raw) ?? doc.slug
    const body = escapeMdx(rewriteLinks(raw, doc.fromDir))

    const meta = frontmatter({
      title,
      description: firstParagraph(raw),
      order: order.get(doc.slug) ?? 999,
      // Provenance, so a reader of the generated file knows not to edit it.
      source: `${doc.fromDir}/${path.basename(doc.file)}`,
    })

    fs.writeFileSync(path.join(outDir, `${doc.slug}.mdx`), meta + body, "utf-8")
    written++
  }
  console.log(`[sync-docs] ${mapping.section}: ${docs.length} page(s)`)
}

console.log(`[sync-docs] wrote ${written} file(s) → ${path.relative(process.cwd(), OUT)}`)
