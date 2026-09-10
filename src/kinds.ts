import type { MosKindId } from "./types";

export type KindStatusMode = "running" | "health";

export interface KindDefaults {
  name: string;
  icon: string;
  statLabel: string;
  statIcon: string;
  /**
   * "running": state_entities are switches — banner shows "x/y running".
   * "health": state_entities are problem binary_sensors — banner shows
   * "All healthy" or "x issue(s)".
   */
  mode: KindStatusMode;
}

export const KIND_DEFAULTS: Record<MosKindId, KindDefaults> = {
  docker_container: {
    name: "Docker",
    icon: "mdi:docker",
    statLabel: "Memory",
    statIcon: "mdi:memory",
    mode: "running",
  },
  compose_stack: {
    name: "Compose Stacks",
    icon: "mdi:layers-triple",
    statLabel: "Memory",
    statIcon: "mdi:memory",
    mode: "running",
  },
  lxc_container: {
    name: "LXC",
    icon: "mdi:server",
    statLabel: "Memory",
    statIcon: "mdi:memory",
    mode: "running",
  },
  vm: {
    name: "VMs",
    icon: "mdi:monitor",
    statLabel: "Memory",
    statIcon: "mdi:memory",
    mode: "running",
  },
  disk: {
    name: "Disks",
    icon: "mdi:harddisk",
    statLabel: "Temp",
    statIcon: "mdi:thermometer",
    mode: "health",
  },
  storage_pool: {
    name: "Storage Pools",
    icon: "mdi:database",
    statLabel: "Free",
    statIcon: "mdi:harddisk",
    mode: "health",
  },
  ups: {
    name: "UPS",
    icon: "mdi:power-plug-outline",
    statLabel: "Load",
    statIcon: "mdi:battery-medium",
    mode: "health",
  },
};
