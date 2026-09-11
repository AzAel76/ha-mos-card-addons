/**
 * A small radial percentage gauge — a 270° arc with a 90° gap centered at
 * the bottom (the common "speedometer" sweep) and an icon in the middle —
 * sized to fill whatever box it's given.
 *
 * Hand-built rather than borrowing Home Assistant's own internal `ha-gauge`:
 * that element is designed for a full-size gauge-card layout (its own baked
 * -in numeric label, sizing intended for a much larger box) and squeezing it
 * into a ~34px inline slot with a different label than the one it computes
 * itself is more fighting-the-component than the SVG below.
 */
import { LitElement, html, svg, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

const SIZE = 40;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Total gap in degrees, centered at the bottom (6 o'clock) of the ring. */
const GAP_DEGREES = 90;
const SWEEP_DEGREES = 360 - GAP_DEGREES;
/** Rotates the ring so the gap centers at the bottom instead of the default 3-o'clock start. */
const ROTATE_DEGREES = 90 + GAP_DEGREES / 2;
const SWEEP_LENGTH = CIRCUMFERENCE * (SWEEP_DEGREES / 360);

@customElement("mos-memory-gauge")
export class MosMemoryGauge extends LitElement {
  /** 0-100, or `undefined` for a muted "no data" ring. */
  @property({ type: Number }) public value?: number;

  /** Base color below the warning/error thresholds — those still take priority regardless. */
  @property({ type: String }) public color?: string;

  /** Icon shown in the center of the ring. */
  @property({ type: String }) public icon = "mdi:memory";

  protected render() {
    const known = typeof this.value === "number" && Number.isFinite(this.value);
    const pct = known ? Math.max(0, Math.min(100, this.value as number)) : 0;
    const valueLength = SWEEP_LENGTH * (pct / 100);
    const color = !known
      ? "var(--disabled-color, #9e9e9e)"
      : pct >= 95
        ? "var(--error-color, #db4437)"
        : pct >= 80
          ? "var(--warning-color, #ff9800)"
          : this.color || "var(--primary-color)";

    return html`
      <div class="wrap">
        <svg viewBox="0 0 ${SIZE} ${SIZE}">
          <g transform="rotate(${ROTATE_DEGREES} ${SIZE / 2} ${SIZE / 2})">
            <circle
              class="track"
              cx=${SIZE / 2}
              cy=${SIZE / 2}
              r=${RADIUS}
              stroke-width=${STROKE}
              stroke-dasharray="${SWEEP_LENGTH} ${CIRCUMFERENCE}"
            ></circle>
            ${known
              ? svg`<circle
                  class="value"
                  cx=${SIZE / 2}
                  cy=${SIZE / 2}
                  r=${RADIUS}
                  stroke-width=${STROKE}
                  stroke=${color}
                  stroke-dasharray="${valueLength} ${CIRCUMFERENCE}"
                ></circle>`
              : nothing}
          </g>
        </svg>
        <ha-icon class="center-icon" icon=${this.icon}></ha-icon>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .wrap {
      position: relative;
      width: 100%;
      height: 100%;
    }
    svg {
      width: 100%;
      height: 100%;
    }
    circle {
      fill: none;
    }
    .track {
      stroke: var(--divider-color, rgba(127, 127, 127, 0.25));
    }
    .value {
      stroke-linecap: round;
      transition:
        stroke-dasharray 0.3s ease,
        stroke 0.3s ease;
    }
    .center-icon {
      position: absolute;
      inset: 0;
      margin: auto;
      width: 14px;
      height: 14px;
      --mdc-icon-size: 14px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "mos-memory-gauge": MosMemoryGauge;
  }
}
