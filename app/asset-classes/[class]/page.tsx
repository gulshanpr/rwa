import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Screener } from "@/components/screener/screener";
import { ASSET_CLASSES, assetClassFromPath } from "@/lib/profile";
import { assetRows } from "@/lib/rows";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(ASSET_CLASSES).map((c) => ({ class: c.path }));
}

const DESCRIPTIONS = {
  "us-treasuries": "Tokenized money market funds and T-bill funds. Usually a stable $1 NAV or an accumulating NAV.",
  "private-credit": "Onchain lending pools and tokenized credit funds, including ERC-4626 vaults.",
} as const;

export async function generateMetadata({ params }: PageProps<"/asset-classes/[class]">) {
  const cls = assetClassFromPath((await params).class);
  return { title: cls ? ASSET_CLASSES[cls].label : "Asset class" };
}

export default async function AssetClassPage({ params }: PageProps<"/asset-classes/[class]">) {
  const cls = assetClassFromPath((await params).class) ?? notFound();
  const rows = await assetRows();
  const count = rows.filter((r) => r.assetClass === cls).length;

  return (
    <>
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: ASSET_CLASSES[cls].short }]} />
      <div className="mb-5">
        <h1 className="text-[26px] leading-9 font-semibold md:text-display">{ASSET_CLASSES[cls].label}</h1>
        <p className="mt-1 text-body text-fg-muted">
          {DESCRIPTIONS[cls]} {count} tracked so far.
        </p>
      </div>
      <Screener rows={rows} defaultClass={cls} />
    </>
  );
}
