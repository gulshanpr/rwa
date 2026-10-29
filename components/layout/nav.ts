import {
  Bell,
  History,
  House,
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
    heading: "Research",
    items: [
      { label: "Methodology", href: "/methodology", icon: Ruler },
      { label: "Changelog", href: "/changelog", icon: History },
    ],
  },
];
