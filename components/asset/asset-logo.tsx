import Image from "next/image";

// Files in public/assets. JAAA and JTRSY share the Janus Henderson mark.
const LOGOS: Record<string, string> = {
  acred: "/assets/acred.png",
  buidl: "/assets/buidl.png",
  falconx: "/assets/falconx.png",
  jaaa: "/assets/jaaa.svg",
  jtrsy: "/assets/jaaa.svg",
  "mf-one": "/assets/mf-one.png",
  ousg: "/assets/ousg.png",
  syrupusdc: "/assets/syrupusdc.png",
  ustb: "/assets/ustb.png",
  usyc: "/assets/usyc.png",
};

/** Round token logo, falling back to the ticker when no file exists. */
export function AssetLogo({ slug, ticker, size = 48 }: { slug: string; ticker: string; size?: number }) {
  const src = LOGOS[slug];
  if (!src) {
    return (
      <div
        aria-hidden
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold tracking-tight text-accent"
      >
        {ticker.slice(0, 5)}
      </div>
    );
  }
  // Fixed box so a stretching flex parent can't distort it; clips square marks to a circle.
  return (
    <div style={{ width: size, height: size }} className="shrink-0 overflow-hidden rounded-full">
      <Image src={src} alt="" width={size} height={size} className="size-full object-cover" />
    </div>
  );
}
