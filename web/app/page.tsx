import { LandingContent } from "./landing-content";

// base:app_id meta tag is rendered in app/layout.tsx (top of <head>)
// for Base App verifier. No per-page metadata override needed here.

export default function Home() {
  return <LandingContent />;
}
