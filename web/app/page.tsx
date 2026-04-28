import type { Metadata } from "next";
import { LandingContent } from "./landing-content";

export const metadata: Metadata = {
  other: {
    "base:app_id": "69f0c295bf0a75fdec18c287",
  },
};

export default function Home() {
  return <LandingContent />;
}
