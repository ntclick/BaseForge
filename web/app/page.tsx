import type { Metadata } from "next";
import { LandingContent } from "./landing-content";

export const metadata: Metadata = {
  other: {
    "base:app_id": "69df5e6c2dd1dde3dd9460f1",
  },
};

export default function Home() {
  return <LandingContent />;
}
