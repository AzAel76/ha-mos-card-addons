import type { ActionConfig, HomeAssistant, LovelaceCardConfig, LovelaceCardEditor } from "custom-card-helpers";
import type { DetailKindId } from "./detail-kinds";

export interface MosDetailCardConfig extends LovelaceCardConfig {
  type: "custom:mos-detail-card";
  /**
   * device_id of the guest/pool/disk device to show detail for. Deliberately
   * matches `ha-mos-card`'s own `[[device_id]]` placeholder token name, so a
   * popup-card config can reference `device_id: "[[device_id]]"` verbatim —
   * see the package README's worked example.
   */
  device_id?: string;
  /** Overrides auto-detection of the device's kind from its `model_id`. Only needed if a future ha-mos device carries a `model_id` this card doesn't yet recognize. */
  kind?: DetailKindId;
  /** Overrides the device's own name. */
  title?: string;
  /** Icon/picture, title, and kind-specific descriptive attributes (image labels for Docker/Compose, disk model/type/size, pool filesystem type, ...). Default true. */
  show_identity?: boolean;
  /** Current-value gauges: CPU/memory usage for guests, usage for pools, temperature for disks. Default true. */
  show_stats?: boolean;
  /** CPU/memory/pool-usage history sparkline(s), kind-permitting. Default true. */
  show_history?: boolean;
  /** Lookback window, in hours, for the history sparkline(s). Default 3. */
  history_hours?: number;
  /** A faint 0/50/100% reference scale on the history sparkline(s). Default false. */
  sparkline_show_value_scale?: boolean;
  /** Small time-axis tick labels ("-3h", "now") on the history sparkline(s). Default false. */
  sparkline_show_time_scale?: boolean;
  /** Health/update-available/autostart badges for guests, problem/scrub-running for pools, SMART-warning/preclear-running for disks. Default true. */
  show_status?: boolean;
  /** Compose only: where the running/total container count appears — "stats" (a stat item alongside CPU/memory, gated by show_stats) or "subtitle" (a text line under the title, gated by show_identity). Default "stats". No-op for every other kind. */
  container_count_style?: "stats" | "subtitle";
  /** Compose only: the list of this stack's member containers (and the images it runs). Default true. No-op for every other kind. */
  show_containers?: boolean;
  /** Compose only: "list" (one row per container, default) or "chips" (wrapped pills). */
  containers_list_style?: "list" | "chips";
  /** Server only: layout for the temperature readings (grouped CPU / System / Disk) — "bars" (default, one horizontal bar per reading), "grid" (a small gauge per reading), or "history" (CPU Main as a gauge + labeled sparkline, every other reading as a plain value). No-op for every other kind. */
  cpu_temp_detail_style?: "bars" | "grid" | "history";
  /** Server only: the generic hardware-sensor readings ha-mos exposes (motherboard, PSU, ...) — the "System" group. Default true. These can duplicate CPU/disk readings with no reliable way to detect it (confirmed: MOS's own /sensors API carries no field linking a reading back to a specific disk or "this is the CPU"), so this is the way to hide them on a server where they add no new information. No-op for every other kind. */
  show_hardware_sensors?: boolean;
  /** A real, interactive power on/off toggle — guest kinds only (docker/compose/lxc/vm). Default true. */
  show_power_toggle?: boolean;
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export type { HomeAssistant };

declare global {
  interface HTMLElementTagNameMap {
    "mos-detail-card": import("./mos-detail-card").MosDetailCard;
    "mos-detail-card-editor": LovelaceCardEditor;
  }
}
