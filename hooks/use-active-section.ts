"use client"

import { usePathname } from "next/navigation"
import type { DocSection } from "@shell/lib/types"

/** The `dir` of the section being viewed, or `null` outside `/docs/`. */
export type ActiveSection = string | null

/**
 * Returns the current docs section based on the URL: `/docs/<section>/...`
 * → `"<section>"`, anything else → `null`. Unknown first segments (a
 * root-level doc, say) also return `null` so the sidebar falls back to
 * showing everything.
 */
export function useActiveSection(sections: DocSection[]): ActiveSection {
  const pathname = usePathname() ?? ""
  if (!pathname.startsWith("/docs/")) return null
  const dir = pathname.split("/")[2]
  if (!dir) return null
  return sections.some((s) => s.dir === dir) ? dir : null
}
