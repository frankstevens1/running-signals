import type { SimpleIcon } from "simple-icons";
import { siDatabricks, siGarmin, siNextdotjs, siPython, siVercel } from "simple-icons";

type TechLogoProps = {
  label: string;
  description: string;
  icon?: SimpleIcon;
  badge?: string;
};

const logos: TechLogoProps[] = [
  { label: "Python", description: "Ingestion jobs and Garmin payload handling.", icon: siPython },
  { label: "AWS S3", description: "Raw FIT and health file landing zone.", badge: "AWS S3" },
  {
    label: "Databricks",
    description: "External volumes, bronze tables, and SQL access.",
    icon: siDatabricks,
  },
  { label: "dbt", description: "Silver and gold transformations, tests, and docs.", badge: "dbt" },
  { label: "SQL", description: "Readable analytical definitions for marts.", badge: "SQL" },
  { label: "Next.js", description: "Server-rendered frontend explorers.", icon: siNextdotjs },
  { label: "Vercel", description: "Hosted site surface for reviewers.", icon: siVercel },
  { label: "Garmin", description: "Source system for activity and health data.", icon: siGarmin },
];

export function TechLogo({ label, description, icon, badge }: TechLogoProps) {
  return (
    <div className="rounded-md border border-(--border) bg-(--surface) p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-(--border) bg-(--surface-muted) text-(--accent)">
          {icon ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d={icon.path} />
            </svg>
          ) : (
            <span className="px-1 text-center font-mono text-[0.65rem] font-semibold uppercase leading-none">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-(--text)">{label}</p>
      </div>
      <p className="mt-3 text-xs leading-5 text-(--text-soft)">{description}</p>
    </div>
  );
}

export function TechLogoGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {logos.map((logo) => (
        <TechLogo key={logo.label} {...logo} />
      ))}
    </div>
  );
}
