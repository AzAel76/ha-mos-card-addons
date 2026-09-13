/** See ../shared/sparkline.ts for the actual implementation — this file only registers this card's own tag name. */
import { customElement } from "lit/decorators.js";
import { MosSparklineBase } from "../shared/sparkline";

@customElement("mos-sparkline")
export class MosSparkline extends MosSparklineBase {}

declare global {
  interface HTMLElementTagNameMap {
    "mos-sparkline": MosSparkline;
  }
}
