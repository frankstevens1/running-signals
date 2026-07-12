import "server-only";

import { cookies, headers } from "next/headers";

import {
  DISTANCE_UNIT_STORAGE_KEY,
  distanceUnitFromLocales,
  isDistanceUnit,
  type DistanceUnit,
} from "./distance-unit";

export async function getServerDistanceUnit(): Promise<DistanceUnit> {
  const cookieStore = await cookies();
  const savedUnit = cookieStore.get(DISTANCE_UNIT_STORAGE_KEY)?.value;

  if (isDistanceUnit(savedUnit)) return savedUnit;

  const headerStore = await headers();
  const acceptedLanguages = headerStore.get("accept-language")?.split(",") ?? [];
  return distanceUnitFromLocales(acceptedLanguages);
}
