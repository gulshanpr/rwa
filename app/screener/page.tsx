import { Suspense } from "react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Screener, ScreenerFromUrl } from "@/components/screener/screener";
import { assetRows } from "@/lib/rows";

export const metadata = { title: "Risk screener" };
export const revalidate = 3600;

export default async function ScreenerPage() {
  const rows = await assetRows();
  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Screener" }]} />
      <div className="mb-5">
        <h1 className="text-[26px] leading-9 font-semibold md:text-display">Risk screener</h1>
        <p className="mt-1 text-body text-fg-muted">
          Every tracked asset with its seven risk ratings, stage and key flags. Sort and filter to compare them.
        </p>
      </div>
      {/* The page stays static; ?class= is applied in the browser. */}
      <Suspense fallback={<Screener rows={rows} />}>
        <ScreenerFromUrl rows={rows} />
      </Suspense>
    </>
  );
}
