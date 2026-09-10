import type { HomeAssistant, LovelaceCardConfig } from "custom-card-helpers";

/** Mirrors the device "kinds" from https://github.com/anym001/ha-mos-card */
export type MosKindId =
  | "docker_container"
  | "compose_stack"
  | "lxc_container"
  | "vm"
  | "disk"
  | "storage_pool"
  | "ups";

export interface MosKindConfig {
  kind: MosKindId;
  /** Overrides the default banner title, e.g. "Docker". */
  name?: string;
  /** Overrides the default mdi icon. */
  icon?: string;
  /**
   * Entities whose on/off (or problem) state drives the running/health
   * count and the banner's accent color. switch/binary_sensor entities.
   */
  state_entities?: string[];
  /**
   * Numeric sensor entities summed into the banner's secondary stat, e.g.
   * per-container memory usage sensors summed into one "Memory" total.
   */
  stat_entities?: string[];
  /** Overrides the default secondary-stat label, e.g. "Memory". */
  stat_label?: string;
  /** Overrides the default secondary-stat mdi icon. */
  stat_icon?: string;
}

export interface MosSummaryCardConfig extends LovelaceCardConfig {
  type: "custom:mos-summary-card";
  title?: string;
  cpu_entity?: string;
  memory_entity?: string;
  temperature_entity?: string;
  kinds?: MosKindConfig[];
}

export type { HomeAssistant };

declare global {
  interface HTMLElementTagNameMap {
    "mos-summary-card": import("./mos-summary-card").MosSummaryCard;
  }
}
