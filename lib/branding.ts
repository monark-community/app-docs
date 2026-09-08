/**
 * Client-safe branding, resolved from [docs.config.ts](../docs.config.ts)
 * with defaults filled in so nothing downstream has to null-check.
 */
import { config } from "@shell/lib/config"
import type { BrandingConfig, GithubConfig } from "@shell/lib/types"

const DEFAULT_BRANDING = {
  siteName: "Docs",
  shortName: "Docs",
  siteUrl: "",
  description: "",
  ogImage: "",
  twitterHandle: "",
  logoAlt: "Docs",
  faviconDark: "/favicon_dark.svg",
  faviconLight: "/favicon_light.svg",
  faviconIco: "/favicon.ico",
} as const

const b = config.branding

const github: GithubConfig | undefined = b.github
  ? {
      owner: b.github.owner,
      repo: b.github.repo,
      label: b.github.label ?? "Github",
      showStars: b.github.showStars !== false,
    }
  : undefined

export const branding: Required<Omit<BrandingConfig, "github">> & {
  github: GithubConfig | undefined
} = {
  siteName: b.siteName || DEFAULT_BRANDING.siteName,
  shortName: b.shortName || DEFAULT_BRANDING.shortName,
  siteUrl: b.siteUrl || DEFAULT_BRANDING.siteUrl,
  description: b.description || DEFAULT_BRANDING.description,
  ogImage: b.ogImage || DEFAULT_BRANDING.ogImage,
  twitterHandle: b.twitterHandle || DEFAULT_BRANDING.twitterHandle,
  github,
  logoAlt: b.logoAlt || b.siteName || DEFAULT_BRANDING.logoAlt,
  faviconDark: b.faviconDark || DEFAULT_BRANDING.faviconDark,
  faviconLight: b.faviconLight || DEFAULT_BRANDING.faviconLight,
  faviconIco: b.faviconIco || DEFAULT_BRANDING.faviconIco,
}
