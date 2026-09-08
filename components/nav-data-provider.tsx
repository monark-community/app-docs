"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { DocMeta, DocSection } from "@shell/lib/types"

interface NavData {
  docs: DocMeta[]
  sections: DocSection[]
}

const NavDataContext = createContext<NavData | null>(null)

/**
 * Provides the full navigation model (every doc + the section list) to any
 * descendant client component. Used by the Header to render its section tabs
 * without having to load the data itself.
 */
export function NavDataProvider({
  docs,
  sections,
  children,
}: {
  docs: DocMeta[]
  sections: DocSection[]
  children: ReactNode
}) {
  return (
    <NavDataContext.Provider value={{ docs, sections }}>
      {children}
    </NavDataContext.Provider>
  )
}

export function useNavData(): NavData | null {
  return useContext(NavDataContext)
}
