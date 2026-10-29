import type { Metadata } from "next";
import { getProfile } from "./profile";

export function tabMetadata(tab: string) {
  return async ({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> => {
    const { slug } = await params;
    const profile = await getProfile(slug);
    return { title: profile ? `${profile.asset.ticker} · ${tab}` : tab };
  };
}
