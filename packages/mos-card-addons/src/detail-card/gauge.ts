/** See ../shared/gauge.ts for the actual implementation — this file only registers this card's own tag name. */
import { customElement } from "lit/decorators.js";
import { MosGaugeBase } from "../shared/gauge";

@customElement("mos-detail-gauge")
export class MosDetailGauge extends MosGaugeBase {}

declare global {
  interface HTMLElementTagNameMap {
    "mos-detail-gauge": MosDetailGauge;
  }
}
