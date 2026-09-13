/**
 * Per-element tap/hold/double-tap gesture tracking, extracted so that
 * sub-elements (the power toggle) can each be independently interactive
 * alongside the whole-card action, without duplicating the hold/click timer
 * bookkeeping per element.
 *
 * Each interactive element gets its own `GestureTracker` instance, kept
 * alive across renders (not recreated per render, which would otherwise
 * reset an in-flight hold/double-tap timer if a re-render lands mid-gesture
 * — a real risk here since `hass` ticks trigger frequent re-renders).
 *
 * Unlike the sibling `mos-server-summary-card` package, this card takes no
 * `[[token]]`-style config (its `device_id` config field is a plain string
 * already resolved by whichever card/popup opened it — placeholder
 * substitution, if any, is the *caller's* job), so it needs only the tracker
 * itself, not `fillPlaceholders`/`moreInfoEntity`.
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
