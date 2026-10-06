import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Screener } from "@/components/screener/screener";
import { assetRows } from "@/lib/rows";

export const metadata = { title: "Risk screener" };
export const revalidate = 3600;

export default function ScreenerPage() {
  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Screener" }]} />
      <div className="mb-5">
        <h1 className="text-[26px] leading-9 font-semibold md:text-display">Risk screener</h1>
        <p className="mt-1 text-body text-fg-muted">
          Every tracked asset with its slice colors and key flags. Sort, filter, or download the data.
        </p>
      </div>
      <Screener rows={assetRows()} />
    </>
  );
}
