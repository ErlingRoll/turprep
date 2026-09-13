export const buildInfo = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  /** ISO 8601 timestamp captured when the bundle was built. */
  buildTime: __APP_BUILD_TIME__,
} as const
