/**
 * Replacement for the Whacka `_branding` internal stub. This app no longer
 * runs on the Whacka platform, so there's no "Powered by Whacka" footer to
 * conditionally show — it's always hidden.
 */
export const brandingHidden = true
export const brandingKnown = true
export const onBrandingChange = () => () => {}
export const refreshBranding = () => {}
