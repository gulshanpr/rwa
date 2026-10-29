import { ArrowRight, Building2, ChevronDown, DoorOpen, Eye, Gauge, KeyRound, Landmark, Layers, Scale, type LucideIcon } from "lucide-react";
import { CATEGORY_LABELS, CATEGORY_ORDER, CATEGORY_QUESTIONS, type CategoryId } from "@/lib/framework/types";
import type { AlertSeverity } from "@/lib/schema/live";
import { cn, RISK_DOT, RISK_WORD, SEVERITY_COLOR, type RiskVisual } from "@/lib/ui";

// Building blocks for app/methodology/page.mdx. Plain divs with list roles, so the prose list styles don't apply.

const CATEGORY_ICONS: Record<CategoryId, LucideIcon> = {
  underlying: Landmark,
  legal: Scale,
  counterparties: Building2,
  control: KeyRound,
  transparency: Eye,
  pricing: Gauge,
  exit: DoorOpen,
};

/** Same ids the MDX headings get, so /methodology#control keeps working. */
const anchor = (id: CategoryId) => CATEGORY_LABELS[id].toLowerCase().replace(/[^a-z0-9]+/g, "-");

const box = "rounded-control border border-line bg-surface";

/** The framework in four steps, each linking to its section. */
export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="my-5! grid list-none! gap-3 pl-0! sm:grid-cols-2">{children}</ol>;
}

export function Step({ n, title, href, children }: { n: number; title: string; href: string; children: React.ReactNode }) {
  return (
    <li className="m-0!">
      <a href={href} className={cn(box, "group flex h-full flex-col gap-1.5 p-4 no-underline! transition-colors hover:border-accent/40")}>
        <span className="flex items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">{n}</span>
          <span className="font-semibold text-fg">{title}</span>
          <ArrowRight className="ml-auto size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
        </span>
        <span className="text-[14px] leading-6 text-fg-muted">{children}</span>
      </a>
    </li>
  );
}

/** The seven categories at a glance, plus Stages, each linking to its rules. */
export function RiskGrid() {
  return (
    <div className="my-5 grid gap-3 sm:grid-cols-2">
      {CATEGORY_ORDER.map((id) => {
        const Icon = CATEGORY_ICONS[id];
        return (
          <a key={id} href={`#${anchor(id)}`} className={cn(box, "flex gap-3 p-3.5 no-underline! transition-colors hover:border-accent/40")}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-subtle text-fg-muted">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2 font-semibold text-fg">
                {CATEGORY_LABELS[id]}
                {id === "legal" && <span className="text-label font-normal text-fg-subtle">Not assessed yet</span>}
              </span>
              <span className="block text-[13px] leading-5 text-fg-muted">{CATEGORY_QUESTIONS[id]}</span>
            </span>
          </a>
        );
      })}
      <a href="#stages" className="flex gap-3 rounded-control border border-dashed border-accent/40 bg-accent-soft p-3.5 no-underline! hover:border-accent">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-surface text-accent">
          <Layers className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-fg">Stages 0 to 2</span>
          <span className="block text-[13px] leading-5 text-fg-muted">Across all seven: how much do you have to trust the issuer?</span>
        </span>
      </a>
    </div>
  );
}

const STATES: { rating: RiskVisual; meaning: string }[] = [
  { rating: "green", meaning: "No known problem in this category." },
  { rating: "yellow", meaning: "A weakness worth knowing about." },
  { rating: "red", meaning: "A serious problem: it can cause a loss or stop holders getting out." },
  { rating: "unverified", meaning: "A fact isn't public and could make things worse. Shown with the worst color we could confirm." },
  { rating: "not-assessed", meaning: "Not rated yet. Only Legal Claim, until a legal reviewer joins." },
];

export function RatingStates() {
  return (
    <div role="list" className="my-5 divide-y divide-line rounded-control border border-line text-[14px] leading-6">
      {STATES.map((s) => (
        <div role="listitem" key={s.rating} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-3">
          <span className="flex w-28 shrink-0 items-center gap-2 font-medium sm:h-6">
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", RISK_DOT[s.rating])} />
            {RISK_WORD[s.rating]}
          </span>
          <span className="min-w-0 text-fg-muted">{s.meaning}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * One category's full rules, folded under its name and question. Native <details>: closed by default,
 * opened by a click, by find-in-page, and by a link to its heading (OnThisPage handles browsers that don't).
 */
export function Category({ id, children }: { id: CategoryId; children: React.ReactNode }) {
  const Icon = CATEGORY_ICONS[id];
  return (
    <details className={cn(box, "group my-2.5 open:shadow-card")}>
      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="row-span-2 flex size-8 items-center justify-center rounded-control bg-subtle text-fg-muted group-open:bg-accent-soft group-open:text-accent">
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 id={anchor(id)} className="m-0! text-[15px]! leading-6!">
          {CATEGORY_LABELS[id]}
        </h3>
        <ChevronDown className="row-span-2 size-4 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden />
        <span className="text-[13px] leading-5 text-fg-muted">{CATEGORY_QUESTIONS[id]}</span>
      </summary>
      <div className="border-t border-line px-4 pt-4 text-[14px] leading-6 [&>*:last-child]:mb-4! [&>p]:mb-3! [&>ul]:mb-3! [&>ul>li]:my-1!">{children}</div>
    </details>
  );
}

/** A category's rules, always listed green, yellow, red. */
export function Rules({ children }: { children: React.ReactNode }) {
  return (
    <div role="list" className="my-4 divide-y divide-line rounded-control border border-line bg-page/50 text-[14px] leading-6">
      {children}
    </div>
  );
}

export function Rule({ tone, children }: { tone: "green" | "yellow" | "red"; children: React.ReactNode }) {
  return (
    <div role="listitem" className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-3">
      <span className="flex w-20 shrink-0 items-center gap-2 font-medium sm:h-6">
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", RISK_DOT[tone])} />
        {RISK_WORD[tone]}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** One step of the stage ladder. Children are the requirements, as a Markdown list. */
export function StageStep({ stage, name, children }: { stage: 0 | 1 | 2; name: string; children: React.ReactNode }) {
  return (
    <div className="relative flex gap-4 pb-2">
      {/* The connector runs down to the next stage; Stage 2 is the last. */}
      {stage < 2 && <span aria-hidden className="absolute top-8 bottom-0 left-[13px] w-px bg-line" />}
      <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent-soft text-[13px] font-semibold text-accent">
        {stage}
      </span>
      <div className="min-w-0 flex-1 pt-0.5 [&>ul]:mb-3!">
        <p className="mb-1! font-semibold">
          Stage {stage} · {name}
        </p>
        {children}
      </div>
    </div>
  );
}

export function Severity({ level }: { level: AlertSeverity }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap capitalize">
      <span aria-hidden className={cn("size-2 rounded-full", RISK_DOT[SEVERITY_COLOR[level]])} />
      {level}
    </span>
  );
}

export function Principles({ children }: { children: React.ReactNode }) {
  return <ol className="my-5! grid list-none! gap-x-6 gap-y-4 pl-0! sm:grid-cols-2">{children}</ol>;
}

export function Principle({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="m-0! flex gap-3 text-[14px] leading-6">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] font-semibold text-fg-muted">{n}</span>
      <span>
        <span className="block font-semibold text-fg">{title}</span>
        <span className="text-fg-muted">{children}</span>
      </span>
    </li>
  );
}
