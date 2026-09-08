import { defineConfig } from "@shell/lib/define-config"

/**
 * The white-label surface. Everything a downstream team needs to rebrand this
 * documentation site lives in this file plus `styles/theme.css` (fonts and
 * design tokens) and `public/` (favicons, OG image). No component edits.
 */
export default defineConfig({
  branding: {
    siteName: "Monark Docs",
    shortName: "Docs",
    siteUrl: "https://docs.monark.io",
    description:
      "Documentation for the Monark application platform — user guides, module guides, and technical documentation.",
    github: {
      owner: "monark-community",
      repo: "app",
      label: "Github",
      showStars: true,
    },
    logoAlt: "Monark",
    faviconDark: "/favicon_dark.svg",
    faviconLight: "/favicon_light.svg",
    faviconIco: "/favicon.ico",
  },

  // Header tabs, left to right. Each `dir` is a folder under `content/docs/`.
  // A folder that lands there without being declared still renders — it just
  // sorts last with a title-cased label.
  sections: [
    { dir: "user-guide", label: "User guide", icon: "BookOpen" },
    { dir: "modules", label: "Modules", icon: "Boxes" },
    { dir: "technical-documentation", label: "Technical", icon: "Code2" },
  ],
})
