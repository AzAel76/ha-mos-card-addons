import type { ActionConfig, HomeAssistant, LovelaceCardConfig, LovelaceCardEditor } from "custom-card-helpers";
import type { KindId } from "./kinds";

export type CardLayout = "standard" | "compact" | "gauge_first";
export type IconStyle = "filled" | "transparent";
export type LinkStyle = "badge" | "button";

export interface MosKindTitleCardConfig extends LovelaceCardConfig {
  type: "custom:mos-kind-title-card";
  /** device_id of the MOS server device, from the ha-mos integration. */
  server?: string;
  kind?: KindId;
  /** Overrides the kind's display name. */
  title?: string;
  /** Overrides the kind's default mdi icon. */
  icon?: string;
  /** A Home Assistant named color token (e.g. "blue", "primary") or a literal CSS color. The icon badge's background when `icon_style` is "filled" (default), or the icon's own color when "transparent" and `icon_color` is unset. */
  color?: string;
  /** "filled" (default): a colored circle behind a white icon. "transparent": no circle, the icon drawn directly in `icon_color` (or `color`). */
  icon_style?: IconStyle;
  /** Overrides the icon glyph's own color, independent of the badge background. */
  icon_color?: string;
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
  /** "badge" (default): a small corner badge on the icon. "button": a standalone tappable icon at the end of the row. */
  link_style?: LinkStyle;
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
