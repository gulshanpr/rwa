import {
  Bell,
  BookOpen,
  CreditCard,
  History,
  House,
  Landmark,
  Ruler,
  Search,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [
      { label: "Home", href: "/", icon: House },
      { label: "Screener", href: "/screener", icon: Search },
      { label: "Alerts", href: "/alerts", icon: Bell },
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
    heading: "Research",
    items: [
      { label: "Methodology", href: "/methodology", icon: Ruler },
      { label: "Learn", href: "/learn", icon: BookOpen },
      { label: "Changelog", href: "/changelog", icon: History },
    ],
  },
];
