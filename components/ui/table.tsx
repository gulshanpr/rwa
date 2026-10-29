import { cn } from "@/lib/ui";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-control border border-line", className)}>
      <table className="w-full border-separate border-spacing-0 text-small">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "sticky top-0 whitespace-nowrap border-b border-line bg-subtle px-3 py-2 text-label text-fg-muted first:pl-4 last:pr-4",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-line px-3 py-2.5 align-middle first:pl-4 last:pr-4 group-last/row:border-b-0",
        align === "right" ? "tnum text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <tr id={id} className={cn("group/row scroll-mt-[calc(var(--topbar-h)+2rem)] transition-colors hover:bg-page target:bg-accent-soft", className)}>
      {children}
    </tr>
  );
}
