/**
 * Fetches and maintains a short rolling window of numeric sensor history,
 * for the CPU load / memory usage sparklines.
 *
 * Home Assistant's own frontend fetches history the same way (confirmed
 * against home-assistant/frontend's `src/data/history.ts`): a raw
 * `history/history_during_period` websocket call — `custom-card-helpers`'
 * `HomeAssistant` type has no `callWS` helper, so `connection` is used
 * directly here, the same workaround `devices.ts` already relies on for the
 * device/entity registry calls. `lu`/`lc` in the response are Unix
 * *seconds*, not milliseconds.
 *
 * Fetched once per card instance on connect for the initial trend line, then
 * extended locally from each live `hass.states` tick (already happening
 * every render anyway) rather than re-polling the history API on a timer.
 */
import type { Connection } from "home-assistant-js-websocket";

export interface HistoryPoint {
  /** Unix milliseconds. */
  t: number;
  v: number;
}

interface RawHistoryState {
  /** state */
  s: string;
  /** last_updated, Unix seconds */
  lu: number;
}

type HistoryStatesResponse = Record<string, RawHistoryState[]>;

/** One entity's numeric state history over the last `hours`, oldest first. Non-numeric states are dropped, not coerced. */
export async function fetchHistory(
  connection: Connection,
  entityIds: readonly string[],
  hours: number,
): Promise<Record<string, HistoryPoint[]>> {
  if (entityIds.length === 0) {
    return {};
  }
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);
  const response = await connection.sendMessagePromise<HistoryStatesResponse>({
    type: "history/history_during_period",
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    entity_ids: [...entityIds],
    minimal_response: true,
    // Safe for plain numeric sensors: HA only needs attributes for a handful
    // of domains (climate, humidifier, person, ...) this card never queries.
    no_attributes: true,
  });

  const result: Record<string, HistoryPoint[]> = {};
  for (const entityId of entityIds) {
    const points: HistoryPoint[] = [];
    for (const state of response[entityId] ?? []) {
      const v = Number(state.s);
      if (Number.isFinite(v)) {
        points.push({ t: state.lu * 1000, v });
      }
    }
    result[entityId] = points;
  }
  return result;
}

/** A rolling window of one entity's numeric history: seeded from a fetch, then extended by live ticks. */
export class HistoryBuffer {
  private points: HistoryPoint[] = [];

  constructor(private readonly windowMs: number) {}

  seed(points: readonly HistoryPoint[]): void {
    this.points = [...points];
    this.trim();
  }

  /** Append (or, if the timestamp hasn't advanced, replace) the latest sample. */
  push(value: number, at: number = Date.now()): void {
    const last = this.points[this.points.length - 1];
    if (last && last.t === at) {
      last.v = value;
    } else {
      this.points.push({ t: at, v: value });
    }
    this.trim();
  }

  get(): readonly HistoryPoint[] {
    return this.points;
  }

  private trim(): void {
    const cutoff = Date.now() - this.windowMs;
    let dropCount = 0;
    while (dropCount < this.points.length - 1 && this.points[dropCount].t < cutoff) {
      dropCount++;
    }
    if (dropCount > 0) {
      this.points = this.points.slice(dropCount);
    }
  }
}
