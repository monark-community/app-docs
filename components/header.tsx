"use client"

import Image from "next/image"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { Button } from "@shell/components/shell-ui/button"
import { LocaleToggle } from "@shell/components/locale-toggle"
import { ThemeToggle } from "@shell/components/theme-toggle"
import { SearchTrigger } from "@shell/components/search"
import { useMobileSidebar } from "@shell/components/sidebar-provider"
import { useNavData } from "@shell/components/nav-data-provider"
import { useActiveSection, type ActiveSection } from "@shell/hooks/use-active-section"
import { branding } from "@shell/lib/branding"
import { cn } from "@shell/lib/utils"

/**
 * The Monark product brand (brand guidelines §2): the colour butterfly mark,
 * a 10px gap, then the product name. No "by Monark" here.
 */
function Brand() {
  return (
    <Link
      href="/"
      aria-label="Monark docs: home"
      className="flex shrink-0 items-center gap-2.5 rounded-md py-1 pr-1 whitespace-nowrap"
    >
      <Image
        src="/brand/monark-mark.svg"
        alt=""
        width={28}
        height={28}
        unoptimized
        priority
        className="size-7"
      />
      <span className="text-lg leading-none font-extrabold tracking-[-0.02em] text-foreground">
        {branding.shortName}
      </span>
    </Link>
  )
}

/** A section link: muted, the active section in foreground (brand guidelines §10). */
function NavLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-md px-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  )
}

/**
 * Standard Monark shell header (brand guidelines §10):
 * [mark] Docs  Section  Section  Section            [Search] (EN|FR) (☾)
 * Below `md`: the brand and a menu button only; the menu opens the docs nav,
 * which also carries search and the theme toggle.
 */
export function Header() {
  const { open: sidebarOpen, toggle } = useMobileSidebar()

  const navData = useNavData()
  const sections = navData?.sections ?? []
  const activeSection: ActiveSection = useActiveSection(sections)
  // Each link lands on its section's first doc — the sidebar then takes over.
  const sectionLinks = sections
    .map((section) => ({
      section,
      firstSlug: navData?.docs.find((d) => d.section === section.dir)?.slug,
    }))
    .filter((t): t is { section: (typeof sections)[number]; firstSlug: string } =>
      Boolean(t.firstSlug),
    )

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="flex h-full items-center px-4 md:px-6">
        <Brand />

        {/* Links: 28px after the brand (20px margin + the link's own 8px padding). */}
        {sectionLinks.length > 0 && (
          <nav aria-label="Sections" className="ml-5 hidden md:block">
            <ul className="flex items-center gap-1.5">
              {sectionLinks.map(({ section, firstSlug }) => (
                <li key={section.dir}>
                  <NavLink
                    href={`/docs/${firstSlug}`}
                    active={activeSection === section.dir}
                  >
                    {section.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="ml-auto hidden items-center gap-2.5 md:flex">
          <SearchTrigger />
          <LocaleToggle />
          <ThemeToggle />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
          className="ml-auto md:hidden"
        >
          {sidebarOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </header>
  )
}
