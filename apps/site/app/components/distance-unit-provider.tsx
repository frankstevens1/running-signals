"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  DISTANCE_UNIT_STORAGE_KEY,
  isDistanceUnit,
  type DistanceUnit,
} from "@/app/lib/distance-unit";

type DistanceUnitContextValue = {
  unit: DistanceUnit;
  setUnit: (unit: DistanceUnit) => void;
};

const DistanceUnitContext = createContext<DistanceUnitContextValue | null>(null);
const DISTANCE_UNIT_CHANGE_EVENT = "running-signals-distance-unit-change";

function persistUnit(unit: DistanceUnit) {
  document.documentElement.dataset.distanceUnit = unit;
  window.localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, unit);
  document.cookie = `${DISTANCE_UNIT_STORAGE_KEY}=${unit}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(DISTANCE_UNIT_CHANGE_EVENT));
}

export function DistanceUnitProvider({
  initialUnit,
  children,
}: {
  initialUnit: DistanceUnit;
  children: ReactNode;
}) {
  const router = useRouter();
  const checkedHydrationUnit = useRef(false);
  const unit = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(DISTANCE_UNIT_CHANGE_EVENT, onStoreChange);
      return () => window.removeEventListener(DISTANCE_UNIT_CHANGE_EVENT, onStoreChange);
    },
    () => {
      const savedUnit = window.localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY);
      return isDistanceUnit(savedUnit) ? savedUnit : initialUnit;
    },
    () => initialUnit,
  );

  useEffect(() => {
    if (checkedHydrationUnit.current) return;
    checkedHydrationUnit.current = true;
    if (unit !== initialUnit) router.refresh();
  }, [initialUnit, router, unit]);

  function setUnit(nextUnit: DistanceUnit) {
    persistUnit(nextUnit);
  }

  return (
    <DistanceUnitContext.Provider value={{ unit, setUnit }}>
      {children}
    </DistanceUnitContext.Provider>
  );
}

export function useDistanceUnit(): DistanceUnitContextValue {
  const value = useContext(DistanceUnitContext);
  if (!value) throw new Error("useDistanceUnit must be used inside DistanceUnitProvider.");
  return value;
}
