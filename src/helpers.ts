import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "custom-card-helpers";

export function getState(
  hass: HomeAssistant,
  entityId?: string
): HassEntity | undefined {
  if (!entityId) return undefined;
  return hass.states[entityId];
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
