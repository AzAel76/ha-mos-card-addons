/**
 * Per-element tap/hold/double-tap gesture tracking, extracted so that
 * sub-elements (a pool pill, the CPU temperature stat) can each be
 * independently interactive alongside the whole-card action, without
 * duplicating the hold/click timer bookkeeping per element.
 *
 * Each interactive element gets its own `GestureTracker` instance, kept
 * alive across renders (not recreated per render, which would otherwise
 * reset an in-flight hold/double-tap timer if a re-render lands mid-gesture
 * — a real risk here since `hass` ticks trigger frequent re-renders).
 */
import type { ActionConfig } from "custom-card-helpers";

export type GestureAction = "tap" | "hold" | "double_tap";

export class GestureTracker {
  private holdTimer?: ReturnType<typeof setTimeout>;
  private holdFired = false;
  private clickTimer?: ReturnType<typeof setTimeout>;
  private clickCount = 0;

  /**
   * Returns pointer handlers bound to this tracker's own timer state.
   * Each handler stops propagation first, so this element's gesture never
   * also fires the whole-card action.
   */
  public handlers(fire: (action: GestureAction) => void): {
    onPointerDown: (e: Event) => void;
    onPointerUp: (e: Event) => void;
    onPointerCancel: (e: Event) => void;
  } {
    return {
      onPointerDown: (e: Event) => {
        e.stopPropagation();
        this.holdFired = false;
        this.holdTimer = setTimeout(() => {
          this.holdFired = true;
          fire("hold");
        }, 500);
      },
      onPointerUp: (e: Event) => {
        e.stopPropagation();
        if (this.holdTimer) {
          clearTimeout(this.holdTimer);
          this.holdTimer = undefined;
        }
        if (this.holdFired) {
          return;
        }
        this.clickCount += 1;
        if (this.clickCount === 1) {
          this.clickTimer = setTimeout(() => {
            this.clickCount = 0;
            fire("tap");
          }, 250);
        } else {
          clearTimeout(this.clickTimer);
          this.clickCount = 0;
          fire("double_tap");
        }
      },
      onPointerCancel: (e: Event) => {
        e.stopPropagation();
        if (this.holdTimer) {
          clearTimeout(this.holdTimer);
          this.holdTimer = undefined;
        }
      },
    };
  }
}

/** What a `[[key]]` placeholder in an action config stands for on one element. */
export type PlaceholderValues = Readonly<Record<string, string | undefined>>;

/**
 * `[[key]]`, not `{{key}}` — confirmed against the sibling `ha-mos-card`
 * project's own placeholder convention (`rows.ts`): "deliberately not
 * `{{ }}`: in Home Assistant those are Jinja... someone who reads them here
 * would reasonably expect `{{ states(...) }}` to work. Nothing here
 * evaluates anything." Matching that spelling here too, for the same reason.
 */
const PLACEHOLDER = /\[\[(\w+)\]\]/g;

/**
 * Recursively replaces `[[token]]` occurrences in every string value of an
 * action config with its resolved value, so one shared action (e.g.
 * `pool_tap_action`) can still reference the specific element it was fired
 * from — e.g. a `fire-dom-event` action's `event_data` carrying
 * `[[pool_name]]`, resolved per pool at fire time. A key missing from
 * `values` is left in place rather than emptied, so a typo is visible
 * (`[[pol_name]]`) instead of silently vanishing. Returns a new value; never
 * mutates the input.
 */
export function fillPlaceholders<T>(value: T, values: PlaceholderValues): T {
  if (typeof value === "string") {
    return value.replace(PLACEHOLDER, (placeholder, key: string) =>
      Object.prototype.hasOwnProperty.call(values, key) ? (values[key] ?? "") : placeholder,
    ) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => fillPlaceholders(item, values)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = fillPlaceholders(item, values);
    }
    return out as T;
  }
  return value;
}

/**
 * The entity a `more-info` action wants opened, if it names one of its own.
 *
 * `handleAction` (from `custom-card-helpers`) reads the entity for
 * `more-info` off the config object it's handed, never off the action
 * config itself — so an `entity` written inside `pool_tap_action` would
 * otherwise be silently ignored, substituted placeholder or not. Lifting it
 * out here (ported from `ha-mos-card`'s identical helper) is what lets
 * `entity: "[[pool_usage_entity]]"` actually open that pool's own sensor
 * instead of doing nothing.
 *
 * Returns `undefined` for every other action, so a `fire-dom-event` payload
 * that happens to carry its own `entity` field stays untouched, and for a
 * `more-info` with no `entity` at all, so the caller's own fallback applies.
 */
export function moreInfoEntity(action: ActionConfig | undefined, values: PlaceholderValues): string | undefined {
  if (action?.action !== "more-info" || !action.entity) {
    return undefined;
  }
  return fillPlaceholders(action.entity, values) || undefined;
}
