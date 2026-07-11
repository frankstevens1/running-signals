import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CalendarCheck,
  DatabaseZap,
  HeartPulse,
  House,
  Map,
  TableProperties,
} from "lucide-react";

export type PageMetadata = {
  href: string;
  label: string;
  description: string;
  group: "Overview" | "Explore" | "Signals" | "Extensions";
  keywords: readonly string[];
  icon: LucideIcon;
};

export const sitePages = {
  home: {
    href: "/",
    label: "Overview",
    description: "Project context, current signals, and pipeline architecture.",
    group: "Overview",
    keywords: ["home", "project", "architecture", "pipeline"],
    icon: House,
  },
  runs: {
    href: "/runs",
    label: "Runs",
    description: "Filter, sort, and inspect modeled Garmin activities.",
    group: "Explore",
    keywords: ["activities", "table", "timeline", "garmin"],
    icon: TableProperties,
  },
  routes: {
    href: "/routes",
    label: "Routes",
    description: "Explore route summaries, maps, and run segments.",
    group: "Explore",
    keywords: ["maps", "geography", "segments", "location"],
    icon: Map,
  },
  consistency: {
    href: "/consistency",
    label: "Consistency",
    description: "Review active weeks, frequency, and training streaks.",
    group: "Signals",
    keywords: ["frequency", "streaks", "active weeks", "calendar"],
    icon: CalendarCheck,
  },
  volume: {
    href: "/volume",
    label: "Volume",
    description: "Analyze distance, rolling load, and long-run contribution.",
    group: "Signals",
    keywords: ["distance", "load", "weekly", "monthly", "long run"],
    icon: BarChart3,
  },
  fitness: {
    href: "/fitness",
    label: "Fitness",
    description: "Inspect descriptive aerobic and recovery trends.",
    group: "Signals",
    keywords: ["pace", "heart rate", "recovery", "hrv", "sleep"],
    icon: HeartPulse,
  },
  methodology: {
    href: "/#methodology",
    label: "Methodology",
    description: "Follow data from Garmin payloads to gold signal models.",
    group: "Overview",
    keywords: ["bronze", "silver", "gold", "dbt", "lineage"],
    icon: DatabaseZap,
  },
  mlReadiness: {
    href: "/ml-readiness",
    label: "ML Readiness",
    description: "Review model-ready outputs and feature opportunities.",
    group: "Extensions",
    keywords: ["machine learning", "features", "models", "downstream"],
    icon: BrainCircuit,
  },
} satisfies Record<string, PageMetadata>;

// Preserve the focused explorer API used by the existing route pages.
export const explorerPages = {
  runs: sitePages.runs,
  routes: sitePages.routes,
  consistency: sitePages.consistency,
  volume: sitePages.volume,
  fitness: sitePages.fitness,
  mlReadiness: sitePages.mlReadiness,
};

export const explorerNavItems = [
  explorerPages.runs,
  explorerPages.routes,
  explorerPages.consistency,
  explorerPages.volume,
  explorerPages.fitness,
  explorerPages.mlReadiness,
] as const;

export const navigationGroups = [
  {
    label: "Overview",
    icon: Activity,
    items: [sitePages.home],
  },
  {
    label: "Explore",
    icon: TableProperties,
    items: [sitePages.runs, sitePages.routes],
  },
  {
    label: "Signals",
    icon: BarChart3,
    items: [sitePages.consistency, sitePages.volume, sitePages.fitness],
  },
  {
    label: "Extensions",
    icon: BrainCircuit,
    items: [sitePages.mlReadiness],
  },
] as const;

export const commandPaletteItems: readonly PageMetadata[] = Object.values(sitePages);
