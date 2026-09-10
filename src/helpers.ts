import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "custom-card-helpers";

export function getState(
  hass: HomeAssistant,
  entityId?: string
): HassEntity | undefined {
  if (!entityId) return undefined;
  return hass.states[entityId];
}

export function getStates(hass: HomeAssistant, entityIds?: string[]): HassEntity[] {
  return (entityIds ?? [])
    .map((id) => getState(hass, id))
    .filter((s): s is HassEntity => s !== undefined);
}

export function formatValue(stateObj?: HassEntity): string {
  if (!stateObj) return "–";
  if (stateObj.state === "unavailable" || stateObj.state === "unknown") {
    return "–";
  }
  const unit = stateObj.attributes.unit_of_measurement;
  return unit ? `${stateObj.state} ${unit}` : stateObj.state;
}

export function numericValue(stateObj?: HassEntity): number | undefined {
  if (!stateObj) return undefined;
  const n = Number(stateObj.state);
  return Number.isFinite(n) ? n : undefined;
}

/** True when a binary_sensor-style entity is reporting a problem/off-health state. */
export function isProblem(stateObj?: HassEntity): boolean {
  if (!stateObj) return false;
  return stateObj.state === "on";
}

export function isOn(stateObj?: HassEntity): boolean {
  return stateObj?.state === "on";
}

export function friendlyName(stateObj?: HassEntity, fallback = ""): string {
  return (stateObj?.attributes.friendly_name as string) ?? fallback;
}

/** Sums the numeric state across entities, taking the unit from the first one. */
export function sumNumeric(states: HassEntity[]): { value: number; unit?: string } | undefined {
  const withValues: { n: number; unit?: string }[] = [];
  for (const s of states) {
    const n = numericValue(s);
    if (n !== undefined) {
      withValues.push({ n, unit: s.attributes.unit_of_measurement as string | undefined });
    }
  }
  if (!withValues.length) return undefined;
  const value = withValues.reduce((sum, v) => sum + v.n, 0);
  return { value: Math.round(value * 100) / 100, unit: withValues[0].unit };
}

export function averageNumeric(states: HassEntity[]): { value: number; unit?: string } | undefined {
  const sum = sumNumeric(states);
  if (!sum) return undefined;
  const count = states.filter((s) => numericValue(s) !== undefined).length;
  return { value: Math.round((sum.value / count) * 100) / 100, unit: sum.unit };
}

export function countOn(states: HassEntity[]): number {
  return states.filter((s) => s.state === "on").length;
}

export function countProblems(states: HassEntity[]): number {
  return states.filter((s) => isProblem(s)).length;
}
