import type { ActionConfig, HomeAssistant, LovelaceCardConfig, LovelaceCardEditor } from "custom-card-helpers";

export interface MosServerSummaryCardConfig extends LovelaceCardConfig {
  type: "custom:mos-server-summary-card";
  /** device_id of the MOS server device, from the ha-mos integration. */
  server?: string;
  /** Overrides the server device's own name. */
  title?: string;
  /** URL of a custom header image representing this server. Falls back to a generic server icon when unset. */
  image?: string;
  /** The relative boot time line under the header ("2 days ago"). Default true. */
  show_uptime?: boolean;
  /** The compact MOS version/CPU/kernel/architecture/base OS/memory-installed grid. Default true. */
  show_info?: boolean;
  /** The CPU load gauge + history sparkline. Default true. */
  show_cpu_metric?: boolean;
  /** The memory usage gauge + history sparkline. Default true. */
  show_memory_metric?: boolean;
  /** Lookback window, in hours, for the CPU/memory history sparklines. Default 3. */
  history_hours?: number;
  /** One usage pill per discovered storage pool. Default true. */
  show_pools?: boolean;
  /** The CPU temperature stat. Default true. */
  show_cpu_temp?: boolean;
  /** Tailscale/Netbird connectivity badges, only shown when online. Default true. */
  show_network?: boolean;
  /** SSH/Samba/NFS service-status badges, always shown (muted when disabled). Default true. */
  show_services?: boolean;
  /** Aggregate disk SMART-warning badge, only shown when a disk reports one. Default true. */
  show_disk_health?: boolean;
  /** A corner badge on the header image for updates/problems across every Docker/Compose/LXC/VM guest. Default true. */
  show_guest_status?: boolean;
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
