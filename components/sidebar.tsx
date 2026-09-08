"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useIsMobile } from "@shell/hooks/use-mobile"
import { ChevronRight } from "lucide-react"
import type { DocMeta, DocSection } from "@shell/lib/types"
import { sectionIcon } from "@shell/lib/section-icon"
import { useLocale } from "@shell/lib/i18n"
import { Backdrop } from "@shell/components/shell-ui/backdrop"

import type { ActiveSection } from "@shell/hooks/use-active-section"

interface SidebarProps {
  docs: DocMeta[]
  /** Ordered docs sections — one collapsible block each, in header-tab order. */
  sections: DocSection[]
  open?: boolean
  onClose?: () => void
  collapsed?: boolean
  /** When set, desktop views show only this section. Mobile always shows all. */
  activeSection?: ActiveSection
  /**
   * Which viewport variants of the sidebar to render.
   * - `"all"` (default): mobile floating card + desktop inline.
   * - `"mobile"`: only the mobile floating card + backdrop. Used by the root layout so the
   *   hamburger menu works on every page (including the homepage), without injecting a
   *   desktop sidebar on pages that don't have one.
   * - `"desktop"`: only the desktop inline sidebar. Used by `SidebarLayout` so the docs
   *   pages get their desktop nav while the root layout owns the mobile variant.
   */
  display?: "all" | "mobile" | "desktop"
}

export function Sidebar({
  docs,
  sections,
  open,
  onClose,
  collapsed,
  activeSection,
  display = "all",
}: SidebarProps) {
  // Strip the trailing slash that Next emits when trailingSlash: true is set
  // in next.config.ts (needed for static export). Without this, usePathname()
  // returns e.g. "/docs/user-guide/calendar/" and the href comparisons (which
  // build the path without a trailing slash) never match, so every sidebar
  // link renders as non-active.
  const pathname = (usePathname() ?? "").replace(/\/$/, "") || "/"

  const isMobile = useIsMobile()

  // Close floating nav on mobile navigation only
  const isMobileRef = useRef(isMobile)
  isMobileRef.current = isMobile
  const mountedRef = useRef(false)
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    if (isMobileRef.current) onClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on pathname change
  }, [pathname])

  const renderSection = (section: DocSection) => (
    <SidebarSection key={section.dir} icon={sectionIcon(section.icon)} title={section.label}>
      <SidebarDocList
        docs={docs.filter((d) => d.section === section.dir)}
        pathname={pathname}
      />
    </SidebarSection>
  )

  // Docs sitting at the root of the content tree belong to no section; they
  // render above the sections rather than being dropped.
  const rootDocs = docs.filter((d) => !d.section)
  const rootSection =
    rootDocs.length > 0 ? (
      <ul className="space-y-1">
        {rootDocs.map((doc) => (
          <SidebarDocLink key={doc.slug} doc={doc} pathname={pathname} />
        ))}
      </ul>
    ) : null

  // Mobile: always show every section (no topbar tabs on mobile)
  const mobileNavContent = (
    <nav aria-label="Main navigation" className="p-4 space-y-4">
      {rootSection}
      {sections.map(renderSection)}
    </nav>
  )

  // Desktop: show only the active section (topbar tabs handle section switching)
  const desktopNavContent = (
    <nav aria-label="Main navigation" className="p-4 space-y-4">
      {activeSection && sections.filter((s) => s.dir === activeSection).map(renderSection)}
      {/* Fallback: when we can't determine a section, show all */}
      {!activeSection && (
        <>
          {rootSection}
          {sections.map(renderSection)}
        </>
      )}
    </nav>
  )

  const showMobile = display === "all" || display === "mobile"
  const showDesktop = display === "all" || display === "desktop"

  return (
    <>
      {/* Backdrop — mobile nav only (no backdrop in desktop fullscreen) */}
      {showMobile && open && !collapsed && (
        <Backdrop
          belowHeader
          className="md:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile floating card — mobile only */}
      {showMobile && (
        <aside
          className={`
            md:hidden fixed top-18 left-4 z-50 w-64 rounded-lg border border-border bg-background shadow-xl overflow-y-auto overflow-x-hidden transition-all duration-300 ease-in-out motion-reduce:transition-none
            ${open ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}
          `}
          style={{ maxHeight: "calc(100vh - 6rem)" }}
        >
          {mobileNavContent}
        </aside>
      )}

      {/* Desktop inline sidebar — only when not collapsed */}
      {showDesktop && !collapsed && (
        <aside
          className="hidden md:block w-64 border-r border-border bg-background h-[calc(100vh-3.5rem)] overflow-y-auto overflow-x-hidden sticky top-14 shrink-0"
        >
          {desktopNavContent}
        </aside>
      )}
    </>
  )
}

function SidebarDocList({
  docs,
  pathname,
}: {
  docs: DocMeta[]
  pathname: string
}) {
  // Fast path: nothing nested → flat list.
  const grouped = docs.filter((d) => d.group)
  if (grouped.length === 0) {
    return (
      <ul className="space-y-1">
        {docs.map((doc) => (
          <SidebarDocLink key={doc.slug} doc={doc} pathname={pathname} />
        ))}
      </ul>
    )
  }

  // Docs directly under the section render first, then each sub-folder as a
  // collapsible group in the order the loader emitted them (folder name).
  const ungrouped = docs.filter((d) => !d.group)
  const groups: Array<{ slug: string; docs: DocMeta[] }> = []
  for (const doc of grouped) {
    const existing = groups.find((g) => g.slug === doc.group)
    if (existing) existing.docs.push(doc)
    else groups.push({ slug: doc.group, docs: [doc] })
  }

  return (
    <div className="space-y-2">
      {ungrouped.length > 0 && (
        <ul className="space-y-1">
          {ungrouped.map((doc) => (
            <SidebarDocLink key={doc.slug} doc={doc} pathname={pathname} />
          ))}
        </ul>
      )}
      {groups.map((g) => (
        <SidebarDocGroup key={g.slug} slug={g.slug} docs={g.docs} pathname={pathname} />
      ))}
    </div>
  )
}

function SidebarDocGroup({
  slug,
  docs,
  pathname,
}: {
  /** Sub-folder path, used as the heading, the localStorage key and the DOM id. */
  slug: string
  docs: DocMeta[]
  pathname: string
}) {
  // Persist expand/collapse across navigations via localStorage.
  const storageKey = `docs-shell.sidebar-group.${slug}`
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    const stored = window.localStorage.getItem(storageKey)
    return stored === null ? true : stored === "1"
  })

  // If a doc inside this group is the active route, auto-expand so the user
  // can see their current page in context.
  const activeChildSlug = docs.find((d) => pathname === `/docs/${d.slug}`)?.slug
  useEffect(() => {
    if (activeChildSlug && !open) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when active route enters this group
  }, [activeChildSlug])

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, next ? "1" : "0")
      }
      return next
    })
  }, [storageKey])

  const contentId = `sidebar-group-${slug.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight
          className={`size-3 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        <span>{groupLabel(slug)}</span>
      </button>
      {open && (
        <ul id={contentId} className="space-y-1 mt-1">
          {docs.map((doc) => (
            <SidebarDocLink key={doc.slug} doc={doc} pathname={pathname} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** `guides/advanced` → `Guides / Advanced`. */
function groupLabel(slug: string): string {
  return slug
    .split("/")
    .map((part) =>
      part
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    )
    .join(" / ")
}

/** One doc entry — title follows the active locale when translations exist. */
function SidebarDocLink({ doc, pathname }: { doc: DocMeta; pathname: string }) {
  const { locale } = useLocale()
  return (
    <SidebarLink href={`/docs/${doc.slug}`} active={pathname === `/docs/${doc.slug}`}>
      {doc.titles?.[locale] ?? doc.title}
    </SidebarLink>
  )
}

function SidebarSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
        <Icon className="size-4" />
        <span className="flex-1 text-left">{title}</span>
      </div>
      {children}
    </div>
  )
}

function SidebarLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <li>
      <Link
        href={href}
        className={`block text-sm px-2 py-1.5 rounded-md transition-colors ${
          active
            ? "bg-primary/10 text-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
        }`}
      >
        {children}
      </Link>
    </li>
  )
}
