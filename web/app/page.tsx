import type { Metadata } from "next";
import { LandingContent } from "./landing-content";

const BASE_APP_ID = "69df5e6c2dd1dde3dd9460f1";

export const metadata: Metadata = {
  other: {
    // Some verifiers look for name=, others for property= — emit both.
    "base:app_id": BASE_APP_ID,
  },
};

export default function Home() {
  return (
    <>
      {/* OpenGraph-style fallback — some Base App verifiers parse property= */}
      <meta property="base:app_id" content={BASE_APP_ID} />
      <LandingContent />
    </>
  );
}
