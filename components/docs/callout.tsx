import { cn } from "@/lib/ui";

export function Callout({
  title,
  tone = "accent",
  children,
}: {
  title: string;
  tone?: "accent" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <aside
      className={cn(
        "my-5 rounded-control border px-4 py-3 text-[14px] leading-6 [&>p:last-child]:mb-0!",
        tone === "accent" ? "border-accent/25 bg-accent-soft" : "border-line bg-subtle",
      )}
    >
      <p className="mb-1 text-label font-semibold tracking-wide text-fg-muted uppercase">{title}</p>
      {children}
    </aside>
  );
}
