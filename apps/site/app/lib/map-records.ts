import type { MapProfileRecord } from "./types";

export const MAX_MAP_PROFILE_RECORDS = 500;

export function sampleMapProfileRecords(
  records: readonly MapProfileRecord[],
  limit = MAX_MAP_PROFILE_RECORDS,
): MapProfileRecord[] {
  if (limit < 1 || records.length === 0) return [];
  if (records.length <= limit) return [...records];
  if (limit === 1) return [records[0]];

  const lastIndex = records.length - 1;
  const sampled: MapProfileRecord[] = [];

  for (let sampleIndex = 0; sampleIndex < limit; sampleIndex += 1) {
    const sourceIndex = Math.floor((sampleIndex * lastIndex) / (limit - 1));
    sampled.push(records[sourceIndex]);
  }

  return sampled;
}
