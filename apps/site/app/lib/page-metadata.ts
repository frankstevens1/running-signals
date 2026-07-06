import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BrainCircuit,
  CalendarCheck,
  HeartPulse,
  Map,
  TableProperties,
} from "lucide-react";

type ExplorerPageMetadata = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const explorerPages = {
  runs: {
    href: "/runs",
    label: "Runs",
    icon: TableProperties,
  },
  routes: {
    href: "/routes",
    label: "Routes",
    icon: Map,
  },
  consistency: {
    href: "/consistency",
    label: "Consistency",
    icon: CalendarCheck,
  },
  volume: {
    href: "/volume",
    label: "Volume",
    icon: BarChart3,
  },
  fitness: {
    href: "/fitness",
    label: "Fitness",
    icon: HeartPulse,
  },
  mlReadiness: {
    href: "/ml-readiness",
    label: "ML Readiness",
    icon: BrainCircuit,
  },
} satisfies Record<string, ExplorerPageMetadata>;

export const explorerNavItems = [
  explorerPages.runs,
  explorerPages.routes,
  explorerPages.consistency,
  explorerPages.volume,
  explorerPages.fitness,
  explorerPages.mlReadiness,
] as const;
