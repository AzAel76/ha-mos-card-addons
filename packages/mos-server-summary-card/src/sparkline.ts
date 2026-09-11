/**
 * A small inline SVG trend line over a 0-100 percentage history — no
 * charting library, matching gauge.ts's "hand-rolled SVG, sized to fill
 * whatever box it's given" approach: a full charting dependency is overkill
 * for a lightweight inline trend line, and nothing else in this codebase
 * pulls one in either.
 */
import { LitElement, html, svg, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HistoryPoint } from "./history";

const WIDTH = 100;
const HEIGHT = 30;

@customElement("mos-sparkline")
export class MosSparkline extends LitElement {
  @property({ attribute: false }) public points: readonly HistoryPoint[] = [];

  /** Line color — a plain CSS color or var(), independent of any gauge severity scale since a trend line spans a whole window, not one instant. */
  @property({ type: String }) public color = "var(--primary-color)";

  protected render() {
    if (this.points.length < 2) {
      return nothing;
    }
    const minT = this.points[0].t;
    const maxT = this.points[this.points.length - 1].t;
    const spanT = Math.max(1, maxT - minT);
    const coords = this.points
      .map((point) => {
        const x = ((point.t - minT) / spanT) * WIDTH;
        const y = HEIGHT - (Math.max(0, Math.min(100, point.v)) / 100) * HEIGHT;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return html`
      <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="none">
        ${svg`<polyline points=${coords} stroke=${this.color}></polyline>`}
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
      display: block;
    }
    polyline {
      fill: none;
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "mos-sparkline": MosSparkline;
  }
}
