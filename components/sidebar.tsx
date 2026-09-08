"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { useIsMobile } from "@shell/hooks/use-mobile"
import { ChevronRight } from "lucide-react"
import type { DocMeta, DocNode, DocSection } from "@shell/lib/types"
import { sectionIcon } from "@shell/lib/section-icon"
import { useLocale } from "@shell/lib/i18n"
import { Backdrop } from "@shell/components/shell-ui/backdrop"
import { DragHandle } from "@shell/components/shell-ui/drag-handle"

import type { ActiveSection } from "@shell/hooks/use-active-section"

interface SidebarProps {
  /**
   * Sidebar tree per section dir, mirroring the content folder structure.
   * The empty-string key holds docs that sit at the root of the tree.
   */
  trees: Record<string, DocNode[]>
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
  trees,
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
  const { width, dragging, onResizeStart, onResizeMove, onResizeEnd } = useSidebarWidth()

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
      <SidebarTree nodes={trees[section.dir] ?? []} pathname={pathname} />
    </SidebarSection>
  )

  // Docs sitting at the root of the content tree belong to no section; they
  // render above the sections rather than being dropped.
  const rootNodes = trees[""] ?? []
  const rootSection =
    rootNodes.length > 0 ? <SidebarTree nodes={rootNodes} pathname={pathname} /> : null

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
          style={{ width }}
          className="relative hidden md:block border-r border-border bg-background h-[calc(100vh-3.5rem)] overflow-y-auto overflow-x-hidden sticky top-14 shrink-0"
        >
          {desktopNavContent}
          {/* Right-edge resize grip, matching the app's detail panels : the
              chip reveals on hover and stays while dragging. Inside the
              scrolling aside but pinned to its full height, so it tracks the
              edge rather than the scrolled content. */}
          <DragHandle
            orientation="vertical"
            active={dragging}
            highlight
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            className="absolute right-0 top-0 z-20 h-full w-1.5"
            style={{ height: "100%" }}
          />
        </aside>
      )}
    </>
  )
}

/** Default, floor and ceiling for the sidebar's width, in pixels. */
const DEFAULT_WIDTH = 256
const MIN_WIDTH = 180
const MAX_WIDTH = 520
const WIDTH_KEY = "docs-shell.sidebar-width"

/**
 * Drag-to-resize for the desktop sidebar, persisted per browser.
 *
 * Mirrors the app's detail-panel resize: pointer capture on the grip, the
 * width clamped so the nav can neither vanish nor crowd out the article, and
 * the final value written to localStorage on pointer-up rather than on every
 * move (one write per drag, not one per frame).
 */
function useSidebarWidth() {
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH)
  const [dragging, setDragging] = useState(false)
  const lastWidth = useRef(DEFAULT_WIDTH)

  // Read the stored width after mount rather than in the initializer: the
  // server renders the default, and reading during render would make the
  // first client paint disagree with it.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WIDTH_KEY)
      if (raw) {
        const stored = clamp(Number(raw))
        setWidth(stored)
        lastWidth.current = stored
      }
    } catch {
      // Private mode / blocked storage : the default stands.
    }
  }, [])

  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }, [])

  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      // The sidebar's left edge is the viewport's, so the pointer's x is the
      // width directly.
      const next = clamp(e.clientX)
      lastWidth.current = next
      setWidth(next)
    },
    [dragging],
  )

  const onResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
    try {
      window.localStorage.setItem(WIDTH_KEY, String(lastWidth.current))
    } catch {
      // Not being able to remember the width is not worth failing a drag.
    }
  }, [])

  return { width, dragging, onResizeStart, onResizeMove, onResizeEnd }
}

function clamp(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_WIDTH
  const ceiling =
    typeof window === "undefined" ? MAX_WIDTH : Math.min(MAX_WIDTH, window.innerWidth * 0.4)
  return Math.round(Math.min(Math.max(px, MIN_WIDTH), Math.max(MIN_WIDTH, ceiling)))
}

function SidebarTree({
  nodes,
  pathname,
  depth = 0,
}: {
  nodes: DocNode[]
  pathname: string
  depth?: number
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) =>
        node.kind === "doc" ? (
          <SidebarDocLink key={node.doc.slug} doc={node.doc} pathname={pathname} depth={depth} />
        ) : (
          <SidebarFolder key={node.path} node={node} pathname={pathname} depth={depth} />
        ),
      )}
    </ul>
  )
}

/** True when the active route is this folder's own page or anything inside it. */
function containsActive(node: DocNode, pathname: string): boolean {
  if (node.kind === "doc") return pathname === `/docs/${node.doc.slug}`
  return (
    (node.index !== null && pathname === `/docs/${node.index.slug}`) ||
    node.children.some((child) => containsActive(child, pathname))
  )
}

function SidebarFolder({
  node,
  pathname,
  depth,
}: {
  node: Extract<DocNode, { kind: "folder" }>
  pathname: string
  depth: number
}) {
  const hasActive = containsActive(node, pathname)

  // Persist expand / collapse per folder. Keyed by path (stable) rather than
  // by label, so renaming a folder's index page doesn't reset everyone's
  // preference. A folder holding the active page starts open regardless.
  const storageKey = `docs-shell.sidebar-folder.${node.path}`
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    const stored = window.localStorage.getItem(storageKey)
    return stored === null ? true : stored === "1"
  })

  useEffect(() => {
    if (hasActive && !open) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the active route enters this folder
  }, [hasActive])

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, next ? "1" : "0")
      }
      return next
    })
  }, [storageKey])

  const contentId = `sidebar-folder-${node.path.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`
  const indent = { paddingLeft: `${depth * 0.75 + 0.5}rem` }

  return (
    <li>
      <div className="flex items-center gap-0.5" style={indent}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          // The chevron alone toggles, so a folder with a landing page can be
          // opened without navigating and navigated to without collapsing.
          aria-label={`${open ? "Collapse" : "Expand"} ${node.label}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <ChevronRight
            className={`size-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
            aria-hidden="true"
          />
        </button>
        {node.index ? (
          <Link
            href={`/docs/${node.index.slug}`}
            className={`min-w-0 flex-1 truncate rounded-md px-1.5 py-1.5 text-sm transition-colors ${
              pathname === `/docs/${node.index.slug}`
                ? "bg-primary/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            {node.label}
          </Link>
        ) : (
          // A folder with no index page is a heading, not a destination.
          <button
            type="button"
            onClick={toggle}
            className="min-w-0 flex-1 cursor-pointer truncate rounded-md px-1.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {node.label}
          </button>
        )}
      </div>
      {open && node.children.length > 0 && (
        <ul id={contentId} className="mt-1 space-y-1">
          <SidebarTreeItems nodes={node.children} pathname={pathname} depth={depth + 1} />
        </ul>
      )}
    </li>
  )
}

/** The list items of a tree level, without the wrapping `<ul>`. */
function SidebarTreeItems({
  nodes,
  pathname,
  depth,
}: {
  nodes: DocNode[]
  pathname: string
  depth: number
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === "doc" ? (
          <SidebarDocLink key={node.doc.slug} doc={node.doc} pathname={pathname} depth={depth} />
        ) : (
          <SidebarFolder key={node.path} node={node} pathname={pathname} depth={depth} />
        ),
      )}
    </>
  )
}

/** One doc entry. Title follows the active locale when translations exist. */
function SidebarDocLink({
  doc,
  pathname,
  depth,
}: {
  doc: DocMeta
  pathname: string
  depth: number
}) {
  const { locale } = useLocale()
  const active = pathname === `/docs/${doc.slug}`
  return (
    <li>
      <Link
        href={`/docs/${doc.slug}`}
        // Indent tracks depth so nesting is legible without a guide line at
        // every level; the chevron column is what the extra 1.25rem clears.
        style={{ paddingLeft: `${depth * 0.75 + 1.75}rem` }}
        className={`block truncate rounded-md py-1.5 pr-2 text-sm transition-colors ${
          active
            ? "bg-primary/10 font-medium text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        }`}
      >
        {doc.titles?.[locale] ?? doc.title}
      </Link>
    </li>
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
