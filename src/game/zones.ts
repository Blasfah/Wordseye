import { CONFIG } from '../config';
import type { Zone, ZoneId } from './types';

export function zoneForRank(rank: number | null, zones: readonly Zone[] = CONFIG.zones): ZoneId {
  if (rank !== null) {
    for (const zone of zones) {
      if (zone.maxRank !== null && rank <= zone.maxRank) return zone.id;
    }
  }
  return zones[zones.length - 1].id;
}

export function zoneInfo(id: ZoneId, zones: readonly Zone[] = CONFIG.zones): Zone {
  const zone = zones.find((z) => z.id === id);
  if (!zone) throw new Error(`Unknown zone ${id}`);
  return zone;
}

/** 0 for the best zone, increasing as zones get colder. */
export function zoneOrder(id: ZoneId, zones: readonly Zone[] = CONFIG.zones): number {
  return zones.findIndex((z) => z.id === id);
}

/** The zone that wins a round outright. */
export function bullseyeZone(zones: readonly Zone[] = CONFIG.zones): Zone {
  return zones[0];
}

export interface RankBand {
  zone: Zone;
  from: number;
  to: number;
}

/** The ranked zones as rank ranges: bullseye 1–10, hot 11–100, and so on. */
export function rankBands(zones: readonly Zone[] = CONFIG.zones): RankBand[] {
  const bands: RankBand[] = [];
  let from = 1;
  for (const zone of zones) {
    if (zone.maxRank === null) break;
    bands.push({ zone, from, to: zone.maxRank });
    from = zone.maxRank + 1;
  }
  return bands;
}
