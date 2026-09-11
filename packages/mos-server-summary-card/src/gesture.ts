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

/**
 * Recursively replaces `{{token}}` occurrences in every string value of an
 * action config with its resolved value, so one shared action (e.g.
 * `pool_tap_action`) can still reference the specific element it was fired
 * from — e.g. a `fire-dom-event` action's `event_data` carrying
 * `{{pool_name}}`, resolved per pool at fire time. Returns a new object;
 * never mutates the input.
 */
export function resolveActionTokens<T>(value: T, tokens: Readonly<Record<string, string>>): T {
  if (typeof value === "string") {
    let result: string = value;
    for (const [key, replacement] of Object.entries(tokens)) {
      result = result.split(`{{${key}}}`).join(replacement);
    }
    return result as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveActionTokens(item, tokens)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveActionTokens(item, tokens);
    }
    return out as T;
  }
  return value;
}
