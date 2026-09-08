"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BookOpen, Search, X } from "lucide-react"
import { Command } from "cmdk"
import { Button } from "@shell/components/shell-ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@shell/components/shell-ui/dialog"
import { useTranslations } from "@shell/lib/i18n"

export interface SearchItem {
  /** Heading text, or the page title for a page's opening record. */
  label: string
  /** Page title, shown under the label so a section hit says where it lives. */
  page: string
  href: string
  group: string
  /** Prose under the heading. Matched against, and excerpted in the result. */
  text: string
}

/** A matched record plus what to show for it. */
interface Hit {
  item: SearchItem
  score: number
  /** Excerpt around the match, when the match was in the body rather than the title. */
  excerpt: string | null
}

/**
 * Rank a record against the query's terms. Every term has to appear somewhere
 * (label, page or text) for the record to survive; where they appear decides
 * the order, so a heading called "Recovery codes" beats a page that merely
 * mentions them in passing.
 */
function scoreItem(item: SearchItem, terms: string[]): number | null {
  const label = item.label.toLowerCase()
  const page = item.page.toLowerCase()
  const text = item.text.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (label.startsWith(term)) score += 12
    else if (label.includes(term)) score += 8
    else if (page.includes(term)) score += 4
    else if (text.includes(term)) score += 2
    else return null
  }
  // A whole-phrase hit in a heading is a stronger signal than the same words
  // scattered across one.
  const phrase = terms.join(" ")
  if (terms.length > 1 && label.includes(phrase)) score += 6
  return score
}

/** A window of body text around the first matching term, for context. */
function excerptFor(text: string, terms: string[]): string | null {
  if (!text) return null
  const lower = text.toLowerCase()
  let at = -1
  for (const term of terms) {
    const i = lower.indexOf(term)
    if (i >= 0 && (at === -1 || i < at)) at = i
  }
  if (at === -1) return null
  const start = Math.max(0, at - 40)
  const end = Math.min(text.length, at + 120)
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`
}

// Module-level cache — survives re-renders, shared across mounts
let cachedItems: SearchItem[] | null = null
let fetchPromise: Promise<void> | null = null

function preloadSearchIndex() {
  if (cachedItems || fetchPromise) return
  fetchPromise = fetch("/api/search-index.json")
    .then((r) => r.json())
    .then((data) => { cachedItems = data })
    .catch(() => {})
}

export function SearchTrigger() {
  return <SearchDialog />
}

function SearchDialog() {
  const router = useRouter()
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [items, setItems] = useState<SearchItem[]>([])
  const [loading, setLoading] = useState(false)

  // Preload search index on mount (fires on page load)
  useEffect(() => {
    preloadSearchIndex()
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  // When dialog opens, use cached data or wait for in-flight fetch
  useEffect(() => {
    if (!open || items.length > 0) return
    if (cachedItems) {
      setItems(cachedItems)
      return
    }
    setLoading(true)
    const waitForCache = async () => {
      if (fetchPromise) await fetchPromise
      if (cachedItems) setItems(cachedItems)
      setLoading(false)
    }
    waitForCache()
  }, [open, items.length])

  const onSelect = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  // Rank in the component rather than letting cmdk fuzzy-match: cmdk scores a
  // single `value` string, and putting a section's prose in that value makes
  // every long section match everything. `shouldFilter={false}` below hands
  // filtering here, where a title hit can outrank a body hit.
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hits: Hit[] = terms.length === 0
    ? []
    : items
        .map((item) => {
          const score = scoreItem(item, terms)
          return score === null
            ? null
            : { item, score, excerpt: excerptFor(item.text, terms) }
        })
        .filter((h): h is Hit => h !== null)
        .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
        // Enough to cover a section thoroughly without turning the palette
        // into a scroll marathon.
        .slice(0, 40)

  const groups = hits.reduce<Record<string, Hit[]>>((acc, hit) => {
    ;(acc[hit.item.group] ??= []).push(hit)
    return acc
  }, {})

  return (
    <>
      {/* Desktop: full search bar */}
      <Button
        variant="outline"
        size="sm"
        className="hidden md:inline-flex gap-2 text-muted-foreground font-normal w-56 justify-start"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span>{t("header.search")}</span>
        <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </Button>
      {/* Mobile: icon only */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Search"
      >
        <Search className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="overflow-hidden p-0 sm:max-w-lg max-md:max-w-full! max-md:h-dvh max-md:rounded-none max-md:border-0 max-md:top-0 max-md:translate-y-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <Command
            className="flex flex-col h-full [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
            loop
            shouldFilter={false}
          >
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 size-4 shrink-0 opacity-50" />

              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t("search.placeholder")}
                className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                onClick={() => setOpen(false)}
                className="md:hidden p-1 rounded-md text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <Command.List className="max-h-80 max-md:max-h-none max-md:flex-1 overflow-y-auto p-1" aria-busy={loading} aria-live="polite">
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground" role="status">
                  {t("a11y.loading")}
                </div>
              ) : (
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                {t("search.noResults")}
              </Command.Empty>
              )}
              {Object.entries(groups).map(([group, groupHits]) => (
                <Command.Group key={group} heading={group}>
                  {groupHits.map(({ item, excerpt }) => (
                    <Command.Item
                      key={item.href}
                      value={item.href}
                      onSelect={() => onSelect(item.href)}
                      className="relative flex cursor-pointer select-none items-start gap-2 rounded-sm px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                    >
                      <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          {item.label}
                          {/* The page is only worth naming when the hit is a
                              section of it, not the page itself. */}
                          {item.label !== item.page && (
                            <span className="ml-1.5 text-xs text-muted-foreground">{item.page}</span>
                          )}
                        </span>
                        {excerpt && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {excerpt}
                          </span>
                        )}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
