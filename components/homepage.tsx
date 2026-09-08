/**
 * The site's landing page at `/`. One card per docs section, each linking to
 * that section's first doc — the same job the registry shell's homepage did
 * for components, with sections as the artifact.
 *
 * Deliberately plain: a docs site's landing page is a signpost, not a
 * marketing page. A team that wants a real landing hosts it separately and
 * points it here.
 */
import Link from "next/link"
import { getAllDocs, getSections } from "@shell/lib/docs"
import { branding } from "@shell/lib/branding"

export default function HomePage() {
  const docs = getAllDocs()
  const sections = getSections()

  if (docs.length === 0) return <NoContentPlaceholder />

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="outline-none max-w-5xl mx-auto px-4 md:px-8 py-12"
    >
      <section className="mb-12">
        <h1 className="text-3xl font-bold">{branding.siteName}</h1>
        {branding.description && (
          <p className="mt-2 text-muted-foreground max-w-2xl">{branding.description}</p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => {
          const sectionDocs = docs.filter((d) => d.section === section.dir)
          const first = sectionDocs[0]
          if (!first) return null
          return (
            <Link
              key={section.dir}
              href={`/docs/${first.slug}`}
              className="rounded-lg border border-border p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              <h2 className="font-semibold">{section.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {sectionDocs.length} page{sectionDocs.length === 1 ? "" : "s"}
              </p>
            </Link>
          )
        })}
      </div>
    </main>
  )
}

/**
 * Shown when the content tree is empty — i.e. someone booted the shell before
 * running the docs sync. Zero external dependencies, so it always renders.
 */
function NoContentPlaceholder() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="outline-none max-w-xl mx-auto px-6 py-24 text-center"
    >
      <h1 className="text-2xl font-semibold">No documentation yet</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Nothing under{" "}
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">content/docs</code>. Run{" "}
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">pnpm sync:docs</code> to pull
        the source repository&apos;s Markdown in, then restart the dev server.
      </p>
    </main>
  )
}
