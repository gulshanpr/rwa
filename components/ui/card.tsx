import { cn } from "@/lib/ui";

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 scroll-mt-[calc(var(--topbar-h)+2rem)] rounded-card border border-line bg-surface shadow-card",
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-h2 text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-small text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {/* bodyClassName replaces the default padding: cn() doesn't merge conflicting Tailwind classes. */}
      <div className={bodyClassName ?? "p-4 md:p-5"}>{children}</div>
    </section>
  );
}
