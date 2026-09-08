"use client"

import { Sidebar } from "@shell/components/sidebar"
import { useMobileSidebar } from "@shell/components/sidebar-provider"
import type { DocMeta, DocSection } from "@shell/lib/types"

/**
 * Client-side wrapper that mounts the mobile-only variant of the Sidebar from
 * the root layout. This ensures the hamburger menu in the header works on
 * **every** page (including the homepage), even though the desktop inline
 * sidebar is still scoped to the docs layout via `SidebarLayout`.
 *
 * The full Sidebar component reads its `open` / `onClose` from the
 * `useMobileSidebar` hook, which is a client-side context; this wrapper
 * exists purely to bridge the server `RootLayout` to those hooks.
 */
export function GlobalMobileSidebar({
  docs,
  sections,
}: {
  docs: DocMeta[]
  sections: DocSection[]
}) {
  const { open, close } = useMobileSidebar()
  return <Sidebar docs={docs} sections={sections} open={open} onClose={close} display="mobile" />
}
