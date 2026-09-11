/**
 * A small radial percentage gauge, sized to fill whatever box it's given.
 *
 * Hand-built rather than borrowing Home Assistant's own internal `ha-gauge`:
 * that element is designed for a full-size gauge-card layout (its own baked
 * -in numeric label, sizing intended for a much larger box) and squeezing it
 * into a ~36px inline slot with a different label than the one it computes
 * itself is more fighting-the-component than the ~30 lines of SVG below.
 */
import { LitElement, html, svg, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

const SIZE = 40;
const STROKE = 5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

@customElement("mos-memory-gauge")
export class MosMemoryGauge extends LitElement {
  /** 0-100, or `undefined` for a muted "no data" ring. */
  @property({ type: Number }) public value?: number;

  protected render() {
    const known = typeof this.value === "number" && Number.isFinite(this.value);
    const pct = known ? Math.max(0, Math.min(100, this.value as number)) : 0;
    const offset = CIRCUMFERENCE * (1 - pct / 100);
    const color = !known
      ? "var(--disabled-color, #9e9e9e)"
      : pct >= 95
        ? "var(--error-color, #db4437)"
        : pct >= 80
          ? "var(--warning-color, #ff9800)"
          : "var(--primary-color)";

    return html`
      <svg viewBox="0 0 ${SIZE} ${SIZE}">
        <circle class="track" cx=${SIZE / 2} cy=${SIZE / 2} r=${RADIUS} stroke-width=${STROKE}></circle>
        ${known
          ? svg`<circle
              class="value"
              cx=${SIZE / 2}
              cy=${SIZE / 2}
              r=${RADIUS}
              stroke-width=${STROKE}
              stroke=${color}
              stroke-dasharray=${CIRCUMFERENCE}
              stroke-dashoffset=${offset}
            ></circle>`
          : nothing}
      </svg>
    `;
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
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
        stroke-dashoffset 0.3s ease,
        stroke 0.3s ease;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "mos-memory-gauge": MosMemoryGauge;
  }
}
