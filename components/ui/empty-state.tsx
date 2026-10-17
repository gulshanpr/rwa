import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 inline-flex size-10 items-center justify-center rounded-full border border-line bg-subtle text-fg-muted">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <p className="text-body font-medium text-fg">{title}</p>
      {children && <p className="mt-1 max-w-sm text-small text-fg-muted">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
