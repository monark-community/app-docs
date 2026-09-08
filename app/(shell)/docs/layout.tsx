import { SidebarLayout } from "@shell/components/sidebar-layout"
import { getAllDocs, getSections } from "@shell/lib/docs"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const docs = getAllDocs()
  const sections = getSections()

  return (
    <SidebarLayout docs={docs} sections={sections}>
      {children}
    </SidebarLayout>
  )
}
