import { SidebarLayout } from "@shell/components/sidebar-layout"
import { getSections, getSidebarTrees } from "@shell/lib/docs"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const sections = getSections()

  return (
    <SidebarLayout trees={getSidebarTrees(sections)} sections={sections}>
      {children}
    </SidebarLayout>
  )
}
