// Reversible master switch for Instant Demo Mode. On by default so it works
// the moment it deploys with no env change; set CHERTT_DEMO_MODE=off to
// restore normal onboarding after the sales cycle. Single source of truth so
// the flag is trivially mockable in tests.
// See docs/superpowers/specs/2026-07-24-instant-demo-mode-design.md
export function demoModeEnabled(): boolean {
  return process.env.CHERTT_DEMO_MODE !== "off";
}
