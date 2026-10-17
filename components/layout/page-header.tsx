import { Breadcrumb } from "./breadcrumb";

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <>
      {breadcrumb && <Breadcrumb items={breadcrumb} />}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-9 font-semibold tracking-[-0.02em] text-fg md:text-display">{title}</h1>
          {description && <p className="mt-1.5 max-w-3xl text-body text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </>
  );
}
