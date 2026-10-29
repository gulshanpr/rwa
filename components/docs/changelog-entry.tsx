import { formatDate } from "@/lib/format";
import { cn } from "@/lib/ui";

const KINDS = {
  framework: "Framework",
  data: "Data",
  alerts: "Alerts",
  site: "Site",
} as const;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** One dated changelog entry on the timeline. Children are the Markdown list of changes. */
export function ChangelogEntry({
  date,
  kind,
  version,
  title,
  children,
}: {
  /** YYYY-MM-DD */
  date: string;
  kind: keyof typeof KINDS;
  version?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative border-l border-line pb-8 pl-6 last:pb-0 [&>ul]:mb-0">
      <span
        aria-hidden
        className={cn(
          "absolute top-[7px] -left-[5px] size-[9px] rounded-full ring-4 ring-surface",
          kind === "framework" ? "bg-accent" : "bg-line-strong",
        )}
      />
      <div className="flex flex-wrap items-center gap-2 text-label text-fg-muted">
        <time dateTime={date}>{formatDate(date)}</time>
        <span
          className={cn(
            "rounded-[3px] border px-1.5 leading-[18px]",
            kind === "framework"
              ? "border-accent/30 bg-accent-soft text-accent"
              : "border-line bg-subtle text-fg-muted",
          )}
        >
          {KINDS[kind]}
          {version && ` ${version}`}
        </span>
      </div>
      <h2 id={slug(title)} className="mt-1! mb-2!">
        {title}
      </h2>
      {children}
    </section>
  );
}
