"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useDistanceUnit } from "@/app/components/distance-unit-provider";
import {
  convertDistanceUnit,
  convertPaceUnit,
  type DistanceUnit,
} from "@/app/lib/distance-unit";

function convertSearchValue(
  params: URLSearchParams,
  key: string,
  convert: (value: number) => number,
) {
  const rawValue = params.get(key);
  if (rawValue === null) return;

  const value = Number(rawValue);
  if (!Number.isFinite(value)) return;
  params.set(key, String(Number(convert(value).toFixed(4))));
}

export function DistanceUnitToggle() {
  const { unit, setUnit } = useDistanceUnit();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  function selectUnit(nextUnit: DistanceUnit) {
    if (nextUnit === unit) return;

    setUnit(nextUnit);

    if (pathname === "/runs") {
      const nextParams = new URLSearchParams(searchParams.toString());
      convertSearchValue(nextParams, "minDistance", (value) =>
        convertDistanceUnit(value, unit, nextUnit),
      );
      convertSearchValue(nextParams, "maxDistance", (value) =>
        convertDistanceUnit(value, unit, nextUnit),
      );
      convertSearchValue(nextParams, "minPace", (value) =>
        convertPaceUnit(value, unit, nextUnit),
      );
      convertSearchValue(nextParams, "maxPace", (value) =>
        convertPaceUnit(value, unit, nextUnit),
      );
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
      router.refresh();
      return;
    }

    router.refresh();
  }

  return (
    <div
      role="group"
      aria-label="Distance unit"
      className="flex h-9 items-center border border-(--border) bg-(--surface-muted) px-1 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
    >
      {(["km", "mi"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={unit === option}
          aria-label={`Use ${option === "km" ? "kilometres" : "miles"}`}
          onClick={() => selectUnit(option)}
          className={`h-7 min-w-9 px-2 transition-colors ${
            unit === option
              ? "bg-(--accent) text-(--accent-foreground)"
              : "text-(--text-soft) hover:bg-(--surface) hover:text-(--text)"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
