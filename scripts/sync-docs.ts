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
  /**
   * Section directory under `content/docs/`. Each extended module's
   * `packages/<name>/docs/<section>/` merges into it too, under a `<name>/`
   * folder : modules keep their docs in the package so they leave with it,
   * but a reader finds them next to core.
   */
  section: string
}

/**
 * The reader-facing sections, in the order the source repo's docs are being
 * migrated into (see `.claude/skills/monark-docs` there). Each one publishes
 * `docs/<section>/` plus every module's `packages/<name>/docs/<section>/`.
 */
const READER_SECTIONS = [
  "get-started",
  "use",
  "administer",
  "build",
  "reference",
  "concepts",
  "operate",
  "decisions",
]

const MAPPINGS: Mapping[] = READER_SECTIONS.map(
  (section): Mapping => ({ from: `docs/${section}`, section }),
)

/**
 * Site route (under `/docs/`) for a source directory, or null when that
 * directory isn't published. Nested folders map too : `docs/use/data` →
 * `use/data`, `packages/kanban/docs/use` → `use/kanban`.
 */
function siteDirOf(sourceDir: string): string | null {
  const core = sourceDir.match(/^docs\/([^/]+)(\/.*)?$/)
  if (core && READER_SECTIONS.includes(core[1] ?? "")) return `${core[1]}${core[2] ?? ""}`
  const pkg = sourceDir.match(/^packages\/([^/]+)\/docs\/([^/]+)(\/.*)?$/)
  if (pkg && READER_SECTIONS.includes(pkg[2] ?? "")) return `${pkg[2]}/${pkg[1]}${pkg[3] ?? ""}`
  return null
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
 * pages); otherwise the pages sort alphabetically.
 */
function sectionOrder(dir: string, slugs: string[]): Map<string, number> {
  const order = new Map<string, number>()
  const indexPath = path.join(dir, "_index.md")

  if (fs.existsSync(indexPath)) {
    // The landing page is the folder, not an entry inside it ; its own order
    // is assigned by the *parent* directory (see `orderOfFolders` below), so
    // giving it 0 here would sort the whole folder first among its siblings.
    let next = 1
    const index = fs.readFileSync(indexPath, "utf-8")
    // A contents list is the author's running order : "In this section" links
    // in the order a reader should meet the pages. That is the story order,
    // and it beats alphabetical.
    for (const m of index.matchAll(/\]\(([^)\s]+?)\.md\)/g)) {
      const target = m[1] ?? ""
      // A link to a section that has since become a folder points at its
      // landing page (`webhooks/_index.md`) ; the entry it names is the
      // folder, so read the directory rather than the file.
      // A module's folder is linked at its source location
      // (`../../packages/kanban/docs/use/_index.md`) but sits here as `kanban`.
      const pkg = target.match(/packages\/([^/]+)\/docs\/[^/]+\/_index$/)
      const slug = pkg
        ? pkg[1]
        : path.basename(target) === "_index"
          ? path.basename(path.dirname(target))
          : path.basename(target)
      if (slug && slugs.includes(slug) && !order.has(slug)) order.set(slug, next++)
    }
    for (const slug of [...slugs].sort()) if (!order.has(slug)) order.set(slug, next++)
    return order
  }

  let next = 0
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

      if (repoRelative.endsWith(".md")) {
        const dir = path.dirname(repoRelative)
        const name = path.basename(repoRelative, ".md")
        const mapped = siteDirOf(dir)
        // `_index.md` is the folder's landing page and answers at the
        // folder's own URL — see the folder-index rule in `lib/docs.ts`.
        if (mapped) {
          return name === "_index"
            ? `](/docs/${mapped}${hash})`
            : `](/docs/${mapped}/${name}${hash})`
        }
        return `](${SOURCE_REPO_BLOB}/${repoRelative}${hash})`
      }

      // Directory link: point at the section it maps to, else at GitHub.
      const asDir = repoRelative.replace(/\/$/, "")
      const mappedDir = siteDirOf(asDir)
      if (mappedDir) return `](/docs/${mappedDir}${hash})`
      return `](${SOURCE_REPO_BLOB}/${asDir}${hash})`
    }),
  )
}

/**
 * Pull an author's own frontmatter off a source doc, if it has any.
 *
 * Deliberately minimal (`key: value`, one line each) rather than a YAML
 * dependency : the only keys that mean anything here are `title`,
 * `description` and `order`, and the source repo's docs are plain Markdown
 * that mostly carries none of them.
 */
function splitFrontmatter(text: string): {
  front: Record<string, string | undefined>
  raw: string
} {
  const m = text.match(/^---[^\n]*\n([\s\S]*?)\n---[^\n]*\n?/)
  if (!m) return { front: {}, raw: text }
  const front: Record<string, string> = {}
  for (const line of (m[1] ?? "").split("\n")) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (kv) front[kv[1] as string] = (kv[2] ?? "").trim().replace(/^["']|["']$/g, "")
  }
  return { front, raw: text.slice(m[0].length) }
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
  // Walk, don't list: the source keeps long guides as a folder of focused
  // pages, and the site mirrors that shape (see the tree in lib/docs.ts).
  const out: SourceDoc[] = []
  // `prefix` is the slug folder a module's pages land under (`kanban/…`) ;
  // it is not part of the source path.
  const walk = (from: string, current: string, relative: string[], prefix: string[]) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort()) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(from, abs, [...relative, entry.name], prefix)
        continue
      }
      if (!entry.name.endsWith(".md")) continue
      out.push({
        file: abs,
        fromDir: [from, ...relative].join("/"),
        section: mapping.section,
        slug: [...prefix, ...relative, path.basename(entry.name, ".md")].join("/"),
      })
    }
  }

  const dir = path.join(SOURCE, mapping.from)
  if (fs.existsSync(dir)) walk(mapping.from, dir, [], [])

  const pkgs = path.join(SOURCE, "packages")
  const names = fs.existsSync(pkgs) ? fs.readdirSync(pkgs).sort() : []
  for (const name of names) {
    const from = `packages/${name}/docs/${mapping.section}`
    const pkgDir = path.join(SOURCE, from)
    if (fs.existsSync(pkgDir)) walk(from, pkgDir, [], [name])
  }
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

  // Order is resolved per directory, over that directory's entries as the
  // reader meets them : the pages directly in it AND the folders under it,
  // numbered together. Numbering them separately is what let a folder and a
  // page claim the same position.
  const order = new Map<string, number>()
  // dir -> { files: [name], dirs: [name] }
  const entries = new Map<string, { files: string[]; dirs: Set<string> }>()
  const bucket = (dir: string) => {
    let e = entries.get(dir)
    if (!e) {
      e = { files: [], dirs: new Set() }
      entries.set(dir, e)
    }
    return e
  }
  for (const doc of docs) {
    const parts = doc.slug.split("/")
    const dir = parts.slice(0, -1).join("/")
    const name = parts[parts.length - 1] as string
    // `_index` is the folder itself, ordered by the parent, not a child.
    if (name !== "_index") bucket(dir).files.push(name)
    // Register every ancestor folder with its own parent.
    for (let i = parts.length - 1; i > 0; i--) {
      const child = parts[i - 1] as string
      const parent = parts.slice(0, i - 1).join("/")
      bucket(parent).dirs.add(child)
    }
  }

  // Where each slug folder's files really live : a module's `kanban/` folder
  // reads its `_index.md` from packages/kanban/docs/<section>/, not from
  // under mapping.from.
  const sourceDirOf = new Map<string, string>()
  for (const doc of docs) {
    sourceDirOf.set(doc.slug.split("/").slice(0, -1).join("/"), path.dirname(doc.file))
  }

  for (const [dir, { files, dirs }] of entries) {
    const source = sourceDirOf.get(dir) ?? path.join(SOURCE, mapping.from, dir)
    const names = [...files, ...dirs]
    for (const [name, n] of sectionOrder(source, names)) {
      const slug = dir ? `${dir}/${name}` : name
      // A folder's position is carried by its landing page, which is what
      // the site sorts the folder by.
      order.set(dirs.has(name) ? `${slug}/_index` : slug, n)
    }
  }

  const outDir = path.join(OUT, mapping.section)
  fs.mkdirSync(outDir, { recursive: true })

  for (const doc of docs) {
    const file = fs.readFileSync(doc.file, "utf-8")
    // A source doc may carry its own frontmatter to override what would
    // otherwise be derived. `order` is the one that matters : it is how an
    // author pins a page's place in the story when neither the contents list
    // nor alphabetical says what they mean.
    const { front, raw } = splitFrontmatter(file)
    const title = front.title ?? firstHeading(raw) ?? doc.slug
    const body = escapeMdx(rewriteLinks(raw, doc.fromDir))

    const meta = frontmatter({
      title,
      description: front.description ?? firstParagraph(raw),
      order: front.order !== undefined ? Number(front.order) : (order.get(doc.slug) ?? 999),
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
