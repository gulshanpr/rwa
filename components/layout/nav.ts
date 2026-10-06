import {
  ArrowLeftRight,
  Bell,
  BookOpen,
  Building2,
  CreditCard,
  FileText,
  History,
  House,
  KeyRound,
  Landmark,
  Lock,
  Radio,
  Ruler,
  Search,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  soon?: boolean;
}

export const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [
      { label: "Home", href: "/", icon: House },
      { label: "Screener", href: "/screener", icon: Search },
      { label: "Alerts", href: "/alerts", icon: Bell },
      { label: "Compare", icon: ArrowLeftRight, soon: true },
    ],
  },
  {
    heading: "Asset classes",
    items: [
      { label: "Treasuries", href: "/asset-classes/treasuries", icon: Landmark },
      { label: "Private credit", href: "/asset-classes/private-credit", icon: CreditCard },
    ],
  },
  {
    heading: "Entities",
    items: [
      { label: "Issuers", icon: Building2, soon: true },
      { label: "Custodians", icon: Lock, soon: true },
      { label: "Oracles", icon: Radio, soon: true },
      { label: "Multisigs", icon: KeyRound, soon: true },
    ],
  },
  {
    heading: "Research",
    items: [
      { label: "Methodology", href: "/methodology", icon: Ruler },
      { label: "Reports", icon: FileText, soon: true },
      { label: "Learn", href: "/learn", icon: BookOpen },
      { label: "Changelog", href: "/changelog", icon: History },
    ],
  },
];
