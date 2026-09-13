import { useTranslation } from "react-i18next"
import { getDateLocale } from "../i18n"
import { buildInfo } from "../lib/build-info"
import { PRODUCT_NAME } from "../lib/brand"

export function BuildInfoFooter() {
  const { i18n, t } = useTranslation()
  const buildDate = new Date(buildInfo.buildTime)
  const formattedBuildTime = Number.isNaN(buildDate.getTime())
    ? buildInfo.buildTime
    : new Intl.DateTimeFormat(getDateLocale(i18n.language), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(buildDate)

  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-4 text-center text-xs text-muted">
      <span>
        {PRODUCT_NAME} {t("footer.version", { version: buildInfo.version })}
      </span>
      <span aria-hidden="true">·</span>
      <span>
        {t("footer.commit")} <code className="font-mono">{buildInfo.commit}</code>
      </span>
      <span aria-hidden="true">·</span>
      <span>
        {t("footer.built")}{" "}
        <time dateTime={buildInfo.buildTime}>{formattedBuildTime}</time>
      </span>
    </footer>
  )
}
