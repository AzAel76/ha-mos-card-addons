/**
 * Static per-kind facts: how to find each kind's devices and entities.
 *
 * `modelId` matches the ha-mos device registry's `model_id` (see devices.ts).
 * `metricPrefix` is the entity translation_key prefix — note this does NOT
 * always match `modelId`: the "vm" kind's devices carry `model_id:
 * "virtual_machine"` but its entities are prefixed `vm_` (e.g.
 * `vm_memory_usage`), a real mismatch confirmed against the integration's
 * source rather than assumed.
 */

export type KindId = "docker" | "compose" | "lxc" | "vm";

export const KIND_IDS: readonly KindId[] = ["docker", "compose", "lxc", "vm"];

export type ModelId = "docker_container" | "compose_stack" | "lxc_container" | "virtual_machine";

/** How to resolve one entity: translation_key first, unique_id suffix as fallback. */
export interface MetricDef {
  readonly translationKey: string;
  readonly keySuffix: string;
}

export type SummarySensorId = "running" | "total" | "updates";

export interface SummarySensorDef extends MetricDef {
  readonly id: SummarySensorId;
  readonly label: string;
}

export interface KindDef {
  readonly id: KindId;
  readonly modelId: ModelId;
  readonly name: string;
  readonly icon: string;
  /** The per-guest memory_usage entity, summed across every guest of this kind. */
  readonly memoryMetric: MetricDef;
  /**
   * PR-114 count sensors on the SERVER device (not per-guest). Rows are
   * rendered in this order; a sensor simply isn't listed here at all for a
   * kind that structurally lacks it (LXC/VM have no update tracking) —
   * runtime absence (an older integration without PR-114 at all) is handled
   * generically by resolution failing to find the entity, not by a flag here.
   */
  readonly summarySensors: readonly SummarySensorDef[];
}

const memoryMetric = (prefix: string): MetricDef => ({
  translationKey: `${prefix}_memory_usage`,
  keySuffix: "memory_usage",
});

// PR-114 sensors have key === translation_key, so the unique_id fallback
// suffix is the full translation key text, not a short shared suffix.
const summarySensor = (id: SummarySensorId, translationKey: string, label: string): SummarySensorDef => ({
  id,
  translationKey,
  keySuffix: translationKey,
  label,
});

export const KIND_DEFS: Readonly<Record<KindId, KindDef>> = {
  docker: {
    id: "docker",
    modelId: "docker_container",
    name: "Docker",
    icon: "mdi:docker",
    memoryMetric: memoryMetric("docker"),
    summarySensors: [
      summarySensor("running", "docker_containers_running", "Running"),
      summarySensor("total", "docker_containers_total", "Total"),
      summarySensor("updates", "docker_updates_available", "Updates"),
    ],
  },
  compose: {
    id: "compose",
    modelId: "compose_stack",
    name: "Compose Stacks",
    icon: "mdi:layers-triple",
    memoryMetric: memoryMetric("compose"),
    summarySensors: [
      summarySensor("running", "compose_stacks_running", "Running"),
      summarySensor("total", "compose_stacks_total", "Total"),
      summarySensor("updates", "compose_updates_available", "Updates"),
    ],
  },
  lxc: {
    id: "lxc",
    modelId: "lxc_container",
    name: "LXC",
    icon: "mdi:server",
    memoryMetric: memoryMetric("lxc"),
    summarySensors: [
      summarySensor("running", "lxc_containers_running", "Running"),
      summarySensor("total", "lxc_containers_total", "Total"),
    ],
  },
  vm: {
    id: "vm",
    modelId: "virtual_machine",
    name: "Virtual Machines",
    icon: "mdi:monitor",
    memoryMetric: memoryMetric("vm"),
    summarySensors: [
      summarySensor("running", "vm_machines_running", "Running"),
      summarySensor("total", "vm_machines_total", "Total"),
    ],
  },
};
