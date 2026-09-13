/**
 * A small inline SVG trend line over a 0-100 percentage history — no
 * charting library, matching gauge.ts's "hand-rolled SVG, sized to fill
 * whatever box it's given" approach: a full charting dependency is overkill
 * for a lightweight inline trend line, and nothing else in this codebase
 * pulls one in either.
 *
 * Two optional, independent reference overlays, both rendered as plain HTML
 * (not SVG `<text>`): the SVG uses `preserveAspectRatio="none"` so the
 * polyline fills whatever box it's given, but that non-uniformly stretches
 * *everything* inside it, including glyph shapes — text squeezed into the
 * viewBox comes out visibly distorted. Plain HTML overlays sit outside that
 * scaling entirely.
 * - `showValueScale`: a faint top/bottom reference, labeled `"100"`/`"0"` by
 *   default — CPU load, memory usage and pool usage are all fixed 0-100%
 *   scales, so this is a static reference, not a data-driven min/max (which
 *   would be misleading for a percentage metric). Anchored to the right
 *   edge. `valueScaleTopLabel`/`valueScaleBottomLabel` override the label
 *   text for a non-percentage series plotted against the same fixed 0-100
 *   range (the server kind's CPU-temperature sparkline, labeled
 *   `"100°C"`/`"0°C"`) — the plotted values are still clamped to 0-100
 *   either way, only the displayed label text changes.
 * - `showTimeScale`: tick labels for the actual first/last point's age
 *   ("-3h", "now") — derived from the real timestamps in `points`, not just
 *   the configured lookback window, so it's still correct before a full
 *   window of history has accumulated. Rendered as a row below the plot.
 *
 * The host's rendered height grows to fit whichever overlays are enabled,
 * so the card sizes the `.sparkline` element accordingly rather than this
 * component being clipped.
 *
 * `MosSparklineBase` is undecorated (no `@customElement`) — each card's own
 * `sparkline.ts` subclasses it with its own tag name (`mos-sparkline`,
 * `mos-detail-sparkline`), since all three cards ship in one bundle and
 * `customElements.define()` throws on a duplicate tag name.
 */
import { LitElement, html, svg, css, nothing } from "lit";
import { property } from "lit/decorators.js";
import type { HistoryPoint } from "./history";

const WIDTH = 100;
const PLOT_HEIGHT = 30;

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

export class MosSparklineBase extends LitElement {
  @property({ attribute: false }) public points: readonly HistoryPoint[] = [];

  /** Line color — a plain CSS color or var(), independent of any gauge severity scale since a trend line spans a whole window, not one instant. */
  @property({ type: String }) public color = "var(--primary-color)";

  @property({ type: Boolean, attribute: "show-value-scale" }) public showValueScale = false;

  @property({ type: Boolean, attribute: "show-time-scale" }) public showTimeScale = false;

  @property({ type: String, attribute: "value-scale-top-label" }) public valueScaleTopLabel = "100";

  @property({ type: String, attribute: "value-scale-bottom-label" }) public valueScaleBottomLabel = "0";

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
        const y = PLOT_HEIGHT - (Math.max(0, Math.min(100, point.v)) / 100) * PLOT_HEIGHT;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return html`
      <div class="plot">
        <svg viewBox="0 0 ${WIDTH} ${PLOT_HEIGHT}" preserveAspectRatio="none">
          ${
            this.showValueScale
              ? svg`<line x1="0" y1=${PLOT_HEIGHT / 2} x2=${WIDTH} y2=${PLOT_HEIGHT / 2} class="ref-line"></line>`
              : nothing
          }
          ${svg`<polyline points=${coords} stroke=${this.color}></polyline>`}
        </svg>
        ${
          this.showValueScale
            ? html`<div class="value-scale top">${this.valueScaleTopLabel}</div>
                <div class="value-scale bottom">${this.valueScaleBottomLabel}</div>`
            : nothing
        }
      </div>
      ${
        this.showTimeScale
          ? html`
              <div class="time-scale">
                <span>${formatAgo(minT)}</span>
                <span>${formatAgo(maxT)}</span>
              </div>
            `
          : nothing
      }
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }
    .plot {
      position: relative;
      flex: 1 1 auto;
      min-height: 0;
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
    .value-scale {
      position: absolute;
      right: 2px;
      font-size: 8px;
      line-height: 1;
      color: var(--secondary-text-color);
    }
    .value-scale.top {
      top: 0;
    }
    .value-scale.bottom {
      bottom: 0;
    }
    .time-scale {
      flex: 0 0 auto;
      display: flex;
      justify-content: space-between;
      font-size: 8px;
      line-height: 1;
      color: var(--secondary-text-color);
      padding-top: 2px;
    }
  `;
}
