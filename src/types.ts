import type { ActionConfig, HomeAssistant, LovelaceCardConfig, LovelaceCardEditor } from "custom-card-helpers";
import type { KindId } from "./kinds";

export interface MosKindTitleCardConfig extends LovelaceCardConfig {
  type: "custom:mos-kind-title-card";
  /** device_id of the MOS server device, from the ha-mos integration. */
  server?: string;
  kind?: KindId;
  /** Overrides the kind's display name. */
  title?: string;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export type { HomeAssistant };

declare global {
  interface HTMLElementTagNameMap {
    "mos-kind-title-card": import("./mos-kind-title-card").MosKindTitleCard;
    "mos-kind-title-card-editor": LovelaceCardEditor;
  }
}
