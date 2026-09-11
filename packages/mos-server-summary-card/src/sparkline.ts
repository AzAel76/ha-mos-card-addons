/**
 * A small inline SVG trend line over a 0-100 percentage history — no
 * charting library, matching gauge.ts's "hand-rolled SVG, sized to fill
 * whatever box it's given" approach: a full charting dependency is overkill
 * for a lightweight inline trend line, and nothing else in this codebase
 * pulls one in either.
 *
 * Two optional, independent reference overlays:
 * - `showValueScale`: faint 0/50/100% reference lines/text — CPU load and
 *   memory usage are fixed 0-100% scales, so this is a static reference,
 *   not a data-driven min/max (which would be misleading for a percentage
 *   metric).
 * - `showTimeScale`: tick labels for the actual first/last point's age
 *   ("-3h", "now") — derived from the real timestamps in `points`, not
 *   just the configured lookback window, so it's still correct before a
 *   full window of history has accumulated.
 *
 * The host's rendered height grows to fit whichever overlays are enabled
 * (via the SVG's own viewBox), so the card sizes the `.sparkline` element
 * accordingly rather than this component being clipped.
 */
import { LitElement, html, svg, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HistoryPoint } from "./history";

const WIDTH = 100;
const PLOT_HEIGHT = 30;
const TIME_SCALE_HEIGHT = 10;
const VALUE_SCALE_INSET = 12;

/** A compact "-Xh"/"-Xm"/"now" label for how long ago a timestamp was, relative to now. */
function formatAgo(timestampMs: number): string {
  const seconds = (Date.now() - timestampMs) / 1000;
  if (seconds < 90) {
    return "now";
  }
  if (seconds < 3600) {
    return `-${Math.round(seconds / 60)}m`;
  }
  return `-${Math.round(seconds / 3600)}h`;
}

@customElement("mos-sparkline")
export class MosSparkline extends LitElement {
  @property({ attribute: false }) public points: readonly HistoryPoint[] = [];

  /** Line color — a plain CSS color or var(), independent of any gauge severity scale since a trend line spans a whole window, not one instant. */
  @property({ type: String }) public color = "var(--primary-color)";

  @property({ type: Boolean, attribute: "show-value-scale" }) public showValueScale = false;

  @property({ type: Boolean, attribute: "show-time-scale" }) public showTimeScale = false;

  protected render() {
    if (this.points.length < 2) {
      return nothing;
    }
    const height = PLOT_HEIGHT + (this.showTimeScale ? TIME_SCALE_HEIGHT : 0);
    const plotWidth = this.showValueScale ? WIDTH - VALUE_SCALE_INSET : WIDTH;
    const plotX = this.showValueScale ? VALUE_SCALE_INSET : 0;

    const minT = this.points[0].t;
    const maxT = this.points[this.points.length - 1].t;
    const spanT = Math.max(1, maxT - minT);
    const coords = this.points
      .map((point) => {
        const x = plotX + ((point.t - minT) / spanT) * plotWidth;
        const y = PLOT_HEIGHT - (Math.max(0, Math.min(100, point.v)) / 100) * PLOT_HEIGHT;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return html`
      <svg viewBox="0 0 ${WIDTH} ${height}" preserveAspectRatio="none">
        ${
          this.showValueScale
            ? svg`
                <line x1=${plotX} y1=${PLOT_HEIGHT / 2} x2=${WIDTH} y2=${PLOT_HEIGHT / 2} class="ref-line"></line>
                <text x="0" y="5" class="ref-text">100</text>
                <text x="0" y=${PLOT_HEIGHT - 1} class="ref-text">0</text>
              `
            : nothing
        }
        ${svg`<polyline points=${coords} stroke=${this.color}></polyline>`}
        ${
          this.showTimeScale
            ? svg`
                <text x=${plotX} y=${PLOT_HEIGHT + 8} class="time-text" text-anchor="start">
                  ${formatAgo(minT)}
                </text>
                <text x=${WIDTH} y=${PLOT_HEIGHT + 8} class="time-text" text-anchor="end">
                  ${formatAgo(maxT)}
                </text>
              `
            : nothing
        }
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
    .ref-line {
      stroke: var(--divider-color, rgba(127, 127, 127, 0.25));
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    .ref-text {
      font-size: 6px;
      fill: var(--secondary-text-color);
    }
    .time-text {
      font-size: 6px;
      fill: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "mos-sparkline": MosSparkline;
  }
}
