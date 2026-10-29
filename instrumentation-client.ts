import posthog from "posthog-js";

// Unset = no analytics, e.g. local clones without a PostHog project.
const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (token) {
  posthog.init(token, {
    // Same-origin path rewritten to PostHog in next.config.ts, so ad blockers don't drop events.
    api_host: "/rbx",
    ui_host: "https://us.posthog.com",
    defaults: "2025-05-24",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
    // Open any page with ?ph_optout=1 to stop tracking this browser (demo laptops); ?ph_optout=0 undoes it.
    loaded: (ph) => {
      const optout = new URLSearchParams(window.location.search).get("ph_optout");
      if (optout === "1") ph.opt_out_capturing();
      if (optout === "0") ph.opt_in_capturing();
    },
  });
}
