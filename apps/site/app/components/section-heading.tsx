import type { LucideIcon } from "lucide-react";

export function SectionHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  const eyebrowLine = eyebrow ? (
    <p className="text-sm font-semibold uppercase tracking-normal text-(--accent)">{eyebrow}</p>
  ) : null;

  const descriptionLine = description ? (
    <p className="mt-3 text-base leading-7 text-(--text-soft)">{description}</p>
  ) : null;

  const titleLine = (
    <h1 className="mt-2 text-3xl font-semibold text-(--text) sm:text-4xl">{title}</h1>
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
      <div className="mt-2 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-(--border) bg-(--surface)">
          <Icon className="h-5 w-5 text-(--accent)" aria-hidden="true" />
        </div>
        <h1 className="min-w-0 text-3xl font-semibold text-(--text) sm:text-4xl">{title}</h1>
      </div>
      {descriptionLine}
    </div>
  );
}
