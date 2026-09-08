import { notFound } from "next/navigation"
import { getAllDocs, getDocBySlug, getDocAllLocales } from "@shell/lib/docs"
import { DocsToc } from "@shell/components/docs-toc"
import { LocalizedMdx } from "@shell/components/localized-mdx"
import { branding } from "@shell/lib/branding"

/**
 * Catch-all so a doc's URL mirrors its place in the content tree:
 * `content/docs/user-guide/calendar.mdx` → `/docs/user-guide/calendar`.
 */
export function generateStaticParams() {
  return getAllDocs().map((doc) => ({ slug: doc.slug.split("/") }))
}

export function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  return params.then(({ slug }) => {
    const doc = getDocBySlug(slug.join("/"))
    if (!doc) return {}
    return {
      title: `${doc.meta.title} - ${branding.siteName}`,
      description: doc.meta.description,
    }
  })
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const doc = getDocBySlug(slug.join("/"))

  if (!doc) notFound()

  const locales = getDocAllLocales(slug.join("/"))

  return (
    <div className="mx-auto py-10 px-4 md:px-8 w-full max-w-300 flex justify-center gap-8">
      {/* Left spacer mirrors the TOC width to keep the article column
          horizontally centered under the topbar at xl+. */}
      <div className="hidden xl:block w-44 shrink-0" aria-hidden="true" />
      <article
        data-docs-content
        className="prose prose-zinc dark:prose-invert flex-1 min-w-0 xl:max-w-225"
      >
        <LocalizedMdx locales={locales} />
      </article>
      {/* TOC column — space always reserved at xl+ to avoid layout shift when
          headings change; inner element hidden below xl since there's no room. */}
      <div className="hidden xl:block w-44 shrink-0">
        <div className="sticky top-20">
          <DocsToc />
        </div>
      </div>
    </div>
  )
}
