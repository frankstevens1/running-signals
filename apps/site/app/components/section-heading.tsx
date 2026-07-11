import type { LucideIcon } from "lucide-react";

import { RevealText, TypedRevealText } from "@/app/components/motion-reveal";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  level?: 1 | 2 | 3;
  motion?: "auto" | "typed" | "reveal" | "none";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
  level = 1,
  motion = "auto",
}: SectionHeadingProps) {
  const Heading = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  const resolvedMotion = motion === "auto" ? (title.length <= 48 ? "typed" : "reveal") : motion;
  const eyebrowLine = eyebrow ? (
    <div className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-wider text-(--accent)">
      <span className="h-px w-6 bg-(--accent)" aria-hidden="true" />
      <span>{eyebrow}</span>
    </div>
  ) : null;

  const descriptionLine = description ? (
    <p className="mt-4 max-w-2xl border-l border-(--border) pl-4 text-base leading-7 text-(--text-soft)">
      {description}
    </p>
  ) : null;

  const titleContent =
    resolvedMotion === "typed" ? (
      <TypedRevealText text={title} />
    ) : resolvedMotion === "reveal" ? (
      <RevealText text={title} />
    ) : (
      title
    );

  const titleLine = (
    <Heading className="mt-3 text-3xl font-semibold tracking-tight text-(--text) sm:text-4xl">
      {titleContent}
    </Heading>
  );

  if (!Icon) {
    return (
      <div className="max-w-3xl">
        {eyebrowLine}
        {titleLine}
        {descriptionLine}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {eyebrowLine}
      <div className="mt-3 flex items-start gap-3">
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center border border-(--border) bg-(--surface-muted)">
          <Icon className="h-5 w-5 text-(--accent)" aria-hidden="true" />
        </div>
        <Heading className="min-w-0 text-3xl font-semibold tracking-tight text-(--text) sm:text-4xl">
          {titleContent}
        </Heading>
      </div>
      {descriptionLine}
    </div>
  );
}
