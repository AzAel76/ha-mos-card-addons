import type { ActionConfig, HomeAssistant, LovelaceCardConfig, LovelaceCardEditor } from "custom-card-helpers";
import type { KindId } from "./kinds";

export type CardLayout = "standard" | "compact" | "gauge_first";

export interface MosKindTitleCardConfig extends LovelaceCardConfig {
  type: "custom:mos-kind-title-card";
  /** device_id of the MOS server device, from the ha-mos integration. */
  server?: string;
  kind?: KindId;
  /** Overrides the kind's display name. */
  title?: string;
  /** Overrides the kind's default mdi icon. */
  icon?: string;
  /** A Home Assistant named color token (e.g. "blue", "primary") or a literal CSS color. Tints the icon badge and the gauge's normal-range arc. */
  color?: string;
  /** Default "standard". "compact" is deliberately shorter than 50px for denser dashboards. */
  layout?: CardLayout;
  show_badges?: boolean;
  show_counts?: boolean;
  show_gauge?: boolean;
  /** An extra aggregate CPU-usage stat, summed the same way as memory. Default false. */
  show_cpu?: boolean;
  /** A tappable badge linking to this kind's page in MOS's own web UI. Default true. */
  show_link?: boolean;
  /** Overrides the kind's default URL path segment (e.g. "docker"), in case MOS's actual path differs. */
  link_path?: string;
  /** The containers-within-stacks ratio, distinct from stacks running/total (compose only). Default false. */
  show_containers?: boolean;
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
