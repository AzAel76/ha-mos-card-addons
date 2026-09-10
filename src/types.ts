import type { HomeAssistant, LovelaceCardConfig } from "custom-card-helpers";

export interface MosSummaryCardConfig extends LovelaceCardConfig {
  type: "custom:mos-summary-card";
  title?: string;
  cpu_entity?: string;
  memory_entity?: string;
  temperature_entity?: string;
  storage_entities?: string[];
  disk_entities?: string[];
  container_entities?: string[];
  vm_entities?: string[];
  ups_entity?: string;
}

export type { HomeAssistant };

declare global {
  interface HTMLElementTagNameMap {
    "mos-summary-card": import("./mos-summary-card").MosSummaryCard;
  }
}
