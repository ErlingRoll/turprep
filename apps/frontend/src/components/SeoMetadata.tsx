import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import { PRODUCT_DOMAIN } from "../lib/brand"

const siteUrl = `https://${PRODUCT_DOMAIN}`

function setMetaContent(attribute: "name" | "property", value: string, content: string) {
  const element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${value}"]`,
  )
  element?.setAttribute("content", content)
}

export function SeoMetadata() {
  const { i18n, t } = useTranslation()
  const location = useLocation()

  useEffect(() => {
    const isPrivateRoute = location.pathname.startsWith("/trips/")
    const language = i18n.language === "en" ? "en" : "nb"
    const title = t(isPrivateRoute ? "seo.privateTitle" : "seo.title")
    const description = t("seo.description")

    document.title = title
    document.documentElement.lang = language === "en" ? "en" : "nb-NO"
    setMetaContent("name", "description", description)
    setMetaContent(
      "name",
      "robots",
      isPrivateRoute
        ? "noindex, nofollow, noarchive"
        : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    )
    setMetaContent("property", "og:title", title)
    setMetaContent("property", "og:description", description)
    setMetaContent("property", "og:locale", language === "en" ? "en_US" : "nb_NO")
    setMetaContent("property", "og:url", isPrivateRoute ? `${siteUrl}${location.pathname}` : `${siteUrl}/`)
    setMetaContent("name", "twitter:title", title)
    setMetaContent("name", "twitter:description", description)
  }, [i18n.language, location.pathname, t])

  return null
}
