"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "@shell/lib/i18n"

export function A11yProvider() {
  const { locale } = useLocale()
  const t = useTranslations()
  const [announcement, setAnnouncement] = useState("")
  const prevLocale = useRef(locale)

  // Sync lang attribute with locale
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // Announce locale change
  useEffect(() => {
    if (prevLocale.current !== locale) {
      prevLocale.current = locale
      // Announce the locale change to screen readers. (Upstream disables
      // react-hooks/set-state-in-effect here; that rule ships in react-hooks
      // v6, and eslint-config-next pins v5, so the directive would error as
      // an unknown rule.)
      setAnnouncement(locale === "fr" ? "Langue changée en français" : "Language changed to English")
      const timer = setTimeout(() => setAnnouncement(""), 3000)
      return () => clearTimeout(timer)
    }
  }, [locale])

  return (
    <>
      <a href="#main-content" className="skip-nav">
        {t("a11y.skipToContent")}
      </a>
      {/* Live region for announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </>
  )
}
