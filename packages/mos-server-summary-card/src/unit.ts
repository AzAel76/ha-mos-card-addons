/**
 * Data-size unit handling.
 *
 * ha-mos's memory sensors are `device_class: data_size`, native unit bytes,
 * but Home Assistant auto-converts the exposed state to a `suggested_unit`
 * (MiB for docker/compose/lxc, GiB for vm and the host total) — and a user
 * can further override that per-entity to a decimal unit (MB/GB) independent
 * of what the integration suggests. Summing/dividing those display-unit
 * numbers directly, across sensors that may be in different units, silently
 * produces wrong percentages — so every value is normalized to raw bytes
 * before any arithmetic, and only formatted back to a friendly unit for
 * display at the end.
 */
import type { HassEntity } from "home-assistant-js-websocket";

const BYTES_PER_UNIT: Readonly<Record<string, number>> = {
  B: 1,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
  PiB: 1024 ** 5,
  kB: 1e3,
  MB: 1e6,
  GB: 1e9,
  TB: 1e12,
  PB: 1e15,
};

const warnedUnits = new Set<string>();

/** A numeric value in a given unit, converted to raw bytes. `undefined` for an unrecognized unit. */
export function toBytes(value: number, unit: string | null | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  if (!unit) {
    // No unit attribute at all: treat the number as already being in bytes.
    return value;
  }
  const multiplier = BYTES_PER_UNIT[unit];
  if (multiplier === undefined) {
    if (!warnedUnits.has(unit)) {
      warnedUnits.add(unit);
      console.warn(`mos-server-summary-card: unrecognized data-size unit "${unit}", excluding from sums`);
    }
    return undefined;
  }
  return value * multiplier;
}

/** A HA state object's numeric value, normalized to bytes. `undefined` if unavailable/unknown/non-numeric. */
export function stateToBytes(stateObj: HassEntity | undefined): number | undefined {
  if (!stateObj) {
    return undefined;
  }
  const value = Number(stateObj.state);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return toBytes(value, stateObj.attributes.unit_of_measurement as string | undefined);
}

const DISPLAY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

export interface FormattedNumber {
  /** At most 4 characters — "100", "99.9", "9.99", "0.27" — never wider than the small gauge label has room for. */
  value: string;
  unit: string;
}

/**
 * A number formatted to at most 4 characters regardless of magnitude — the
 * shared rule for every gauge-adjacent value: 0 decimals at 100+, 1 decimal
 * at 10+, 2 decimals below that (which also covers values under 1, e.g.
 * "0.27", without the extra "0." digit blowing the width budget).
 *
 * Thresholds are shaded down by half a step (99.95/9.995 instead of 100/10)
 * so a value that `toFixed` would round up across a tier boundary — e.g.
 * 9.996 — is bucketed by where it rounds *to*, not where it started;
 * otherwise 9.996 would pick the 2-decimal tier and round to "10.00" (5
 * characters).
 */
export function formatSigFigs(value: number): string {
  if (!Number.isFinite(value)) {
    return "–";
  }
  const abs = Math.abs(value);
  if (abs >= 99.95) {
    return value.toFixed(0);
  }
  if (abs >= 9.995) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

/** Raw bytes as a friendly binary unit, value and unit kept separate so the unit can be styled smaller. */
export function formatBytes(bytes: number): FormattedNumber {
  if (bytes <= 0) {
    return { value: "0", unit: "B" };
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), DISPLAY_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  return { value: formatSigFigs(value), unit: DISPLAY_UNITS[exponent] };
}
