import type { ActionConfig, HomeAssistant, LovelaceCardConfig, LovelaceCardEditor } from "custom-card-helpers";

export type UptimeStyle = "relative" | "uptime_compact" | "uptime_verbose";
export type GuestStatusStyle = "badges" | "text" | "ticker";
export type ServicesStyle = "compact" | "labeled" | "detailed";
export type SectionId = "info" | "metrics" | "pools_temp" | "guest_status" | "services";

export const DEFAULT_SECTION_ORDER: readonly SectionId[] = [
  "info",
  "metrics",
  "pools_temp",
  "guest_status",
  "services",
];

export interface MosServerSummaryCardConfig extends LovelaceCardConfig {
  type: "custom:mos-server-summary-card";
  /** device_id of the MOS server device, from the ha-mos integration. */
  server?: string;
  /** Overrides the server device's own name. */
  title?: string;
  /** URL of a custom header image representing this server. Falls back to a generic server icon when unset. */
  image?: string;
  /** Header image/fallback-icon size in pixels. Default 40. */
  image_size?: number;
  /** The boot time / uptime line under the header. Default true. */
  show_uptime?: boolean;
  /** "relative" ("2 days ago"), or a duration since boot ("uptime_compact": "2d 4h 13m", "uptime_verbose": "2 days, 4 hours, 13 minutes"). Default "relative". */
  uptime_style?: UptimeStyle;
  /** The compact MOS version/CPU/kernel/architecture/base OS/memory-installed grid. Default true. */
  show_info?: boolean;
  /** The CPU load gauge + history sparkline. Default true. */
  show_cpu_metric?: boolean;
  /** The memory usage gauge + history sparkline. Default true. */
  show_memory_metric?: boolean;
  /** Lookback window, in hours, for the CPU/memory history sparklines. Default 3. */
  history_hours?: number;
  /** A faint 0/50/100% reference scale on the CPU/memory sparklines. Default false. */
  sparkline_show_value_scale?: boolean;
  /** Small time-axis tick labels ("-3h", "now") on the CPU/memory sparklines. Default false. */
  sparkline_show_time_scale?: boolean;
  /** One usage pill per discovered storage pool. Default true. */
  show_pools?: boolean;
  /** Per-pool label overrides, keyed by the pool's auto-detected name (e.g. "Data") — the value fully replaces the pill's label. */
  pool_labels?: Record<string, string>;
  /** Shared tap/hold/double-tap actions applied to every pool pill. Support {{pool_name}}/{{pool_usage_entity}}/{{pool_problem_entity}} tokens, substituted per pool at fire time. */
  pool_tap_action?: ActionConfig;
  pool_hold_action?: ActionConfig;
  pool_double_tap_action?: ActionConfig;
  /** The CPU temperature stat. Default true. */
  show_cpu_temp?: boolean;
  /** Tap/hold/double-tap actions for the CPU temperature pill. Support {{server_name}}/{{cpu_temp_entity}} tokens. */
  cpu_temp_tap_action?: ActionConfig;
  cpu_temp_hold_action?: ActionConfig;
  cpu_temp_double_tap_action?: ActionConfig;
  /** Tailscale/Netbird connectivity badges, only shown when online. Default true. */
  show_network?: boolean;
  /** SSH/Samba/NFS service-status badges, always shown (muted when disabled). Default true. */
  show_services?: boolean;
  /** "compact" (icon only), "labeled" (icon + short text), or "detailed" (one full row each). Default "compact". */
  services_style?: ServicesStyle;
  /** Aggregate disk SMART-warning badge, only shown when a disk reports one. Default true. */
  show_disk_health?: boolean;
  /** A section summarizing updates/problems across every Docker/Compose/LXC/VM guest, without per-kind detail. Default true. */
  show_guest_status?: boolean;
  /** "badges" (small icon pills), "text" (a static line), or "ticker" (auto-scrolling). Default "badges". */
  guest_status_style?: GuestStatusStyle;
  /** Display order of the below-header sections. The header itself is always first and not included here. Defaults to the order above. */
  section_order?: SectionId[];
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export type { HomeAssistant };

declare global {
  interface HTMLElementTagNameMap {
    "mos-server-summary-card": import("./mos-server-summary-card").MosServerSummaryCard;
    "mos-server-summary-card-editor": LovelaceCardEditor;
  }
}
