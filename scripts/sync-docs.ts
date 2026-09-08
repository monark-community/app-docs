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
 * without needing the source repo present. That covers the copied figures
 * too: `pnpm build` does not run this script, so an image the committed MDX
 * references has to be committed with it or the page ships a broken <img>.
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

/** Where the source repo keeps doc figures, and where they land here. */
const SOURCE_ASSETS = "docs/assets"
const ASSET_OUT = path.join(process.cwd(), "public", "docs-assets")
const ASSET_URL_PREFIX = "/docs-assets"

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

      // A figure : copied into this site's public tree by `copyAssets` below,
      // so every doc references it at one flat path regardless of how deep in
      // the source repo the doc that embeds it lives.
      if (/\.(png|jpe?g|gif|svg|webp)$/i.test(repoRelative)) {
        return `](${ASSET_URL_PREFIX}/${path.basename(repoRelative)})`
      }

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

  // Walk, don't list: the source keeps long guides as a folder of focused
  // pages, and the site mirrors that shape (see the tree in lib/docs.ts).
  const out: SourceDoc[] = []
  const walk = (current: string, relative: string[]) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort()) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(abs, [...relative, entry.name])
        continue
      }
      if (!entry.name.endsWith(".md")) continue
      out.push({
        file: abs,
        fromDir: [mapping.from, ...relative].join("/"),
        section: mapping.section,
        slug: [...relative, path.basename(entry.name, ".md")].join("/"),
      })
    }
  }
  walk(dir, [])
  return out
}

// ── run ───────────────────────────────────────────────────────────────────

/**
 * Copy the source repo's doc figures into `public/docs-assets/`, flattened.
 * Flat because the docs that embed them sit at different depths (a module's
 * guide is four levels down from `docs/assets`), and a doc shouldn't have to
 * know where it ended up on the site to point at its own picture.
 */
function copyAssets(): number {
  const from = path.join(SOURCE, SOURCE_ASSETS)
  if (!fs.existsSync(from)) return 0
  fs.mkdirSync(ASSET_OUT, { recursive: true })
  let copied = 0
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    fs.copyFileSync(path.join(from, entry.name), path.join(ASSET_OUT, entry.name))
    copied++
  }
  return copied
}

if (CLEAN && fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true })
if (CLEAN && fs.existsSync(ASSET_OUT)) fs.rmSync(ASSET_OUT, { recursive: true })

const assets = copyAssets()
if (assets > 0) console.log(`[sync-docs] assets: ${assets} file(s) -> public/docs-assets`)

let written = 0
for (const mapping of MAPPINGS) {
  const docs = collect(mapping)
  if (docs.length === 0) {
    console.warn(`[sync-docs] no files matched ${mapping.from}`)
    continue
  }

  // Order is resolved per directory: a folder's own `_index.md` orders its
  // children, exactly as the section's does at the top level.
  const order = new Map<string, number>()
  if (mapping.kind === "dir") {
    const byDir = new Map<string, string[]>()
    for (const doc of docs) {
      const dir = doc.slug.includes("/") ? doc.slug.slice(0, doc.slug.lastIndexOf("/")) : ""
      const list = byDir.get(dir) ?? []
      list.push(path.basename(doc.slug))
      byDir.set(dir, list)
    }
    for (const [dir, names] of byDir) {
      const source = path.join(SOURCE, mapping.from, dir)
      for (const [name, n] of sectionOrder(source, names, dir ? [] : mapping.pinned)) {
        order.set(dir ? `${dir}/${name}` : name, n)
      }
    }
  } else {
    for (const [name, n] of sectionOrder("", docs.map((d) => d.slug), mapping.pinned)) {
      order.set(name, n)
    }
  }

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

    const target = path.join(outDir, `${doc.slug}.mdx`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, meta + body, "utf-8")
    written++
  }
  console.log(`[sync-docs] ${mapping.section}: ${docs.length} page(s)`)
}

console.log(`[sync-docs] wrote ${written} file(s) → ${path.relative(process.cwd(), OUT)}`)
