/**
 * Static per-kind facts: what a device of each `model_id` actually has, so
 * `mos-detail-card.ts` can render generically ("does this kind have a
 * `powerMetric`?") instead of branching on kind id throughout its render
 * methods. A structurally-absent field (e.g. no `powerMetric` for a pool) is
 * how a section gets skipped — not a boolean flag next to it — exactly the
 * "structural absence handled generically" pattern `mos-kind-title-card`'s
 * `kinds.ts` already established.
 *
 * Confirmed against ha-mos's actual source, not assumed:
 * `sensor/{docker,compose,lxc,vm,disks}.py`,
 * `binary_sensor/{docker,compose,lxc,vm}.py`,
 * `switch/{docker,compose,lxc,vm}.py`, `sensor/pools.py`,
 * `binary_sensor/pools.py`. Every guest metric (`state`, `cpu_usage`,
 * `memory_usage`, `power`, `healthy`, `update_available`, `autostart`)
 * registers with a short `key` (e.g. `"power"`) under a `<kind>_`-prefixed
 * `translation_key` (e.g. `"docker_power"`) — the same key-vs-translation_key
 * mismatch pattern already documented in the sibling
 * `mos-server-summary-card` package's `server-metrics.ts` for pool/disk
 * entities (e.g. `pool_usage` registers with the short key `"usage"`). This
 * was initially missed here (an earlier version used `same()` for every
 * guest field), which only affects `findMetricEntity`'s unique_id-suffix
 * *fallback* path — translation_key lookup is primary and was already
 * correct — but is fixed via `stripped()` regardless, since it's a real
 * mismatch and this project confirms every key pair against source rather
 * than assuming `key === translation_key`. The per-guest `switch.*_power`
 * entity is also the one `ha-mos-card`'s own `[[power]]` placeholder token
 * resolves to, confirmed in its `rows.ts`.
 */
import type { MetricDef } from "./devices";

export type DetailKindId = "docker" | "compose" | "lxc" | "vm" | "pool" | "disk" | "server";

export type ModelId =
  "docker_container" | "compose_stack" | "lxc_container" | "virtual_machine" | "storage_pool" | "disk";

export interface DetailKindDef {
  readonly id: DetailKindId;
  /**
   * Undefined for `"server"`: the MOS server device carries no `model_id`
   * of its own (confirmed elsewhere in this repo — it's identified only as
   * the `via_device_id` parent of a kind-tagged device), so it can't be
   * matched by `findKindByModelId()` the way every other kind is. See
   * `devices.ts`'s `isServerDevice()` for the structural check used
   * instead.
   */
  readonly modelId?: ModelId;
  readonly name: string;
  readonly icon: string;

  // Guest kinds only (docker/compose/lxc/vm) — undefined for pool/disk.
  /** The `state` sensor (running/stopped/...). */
  readonly stateMetric?: MetricDef;
  readonly cpuMetric?: MetricDef;
  readonly memoryMetric?: MetricDef;
  /** The `switch.*_power` entity — this card's power toggle. */
  readonly powerMetric?: MetricDef;
  readonly healthyMetric?: MetricDef;
  readonly updateAvailableMetric?: MetricDef;
  readonly autostartMetric?: MetricDef;
  /** Docker/Compose only: `state` sensor carries OCI-label attrs (`image_title`/`image_description`/`image_source`, `web_ui_url`, `repo`, `network_mode`). LXC/VM have neither, not being image-based. */
  readonly hasRichAttributes: boolean;
  /** All four guest kinds expose `entity_picture` on their `state` sensor, even without rich attributes. */
  readonly hasEntityPicture: boolean;
  /** Compose only: the auto-created container-group counters (`sensor/compose.py`'s `compose_running_containers`/`compose_container_count`). */
  readonly runningContainersMetric?: MetricDef;
  readonly containerCountMetric?: MetricDef;

  // Pool only.
  readonly usageMetric?: MetricDef;
  readonly freeSpaceMetric?: MetricDef;
  readonly totalSpaceMetric?: MetricDef;
  readonly usedSpaceMetric?: MetricDef;
  readonly poolTypeMetric?: MetricDef;
  readonly poolProblemMetric?: MetricDef;
  /** Conditional on filesystem type at runtime (btrfs scrub, zfs scrub, mdadm parity, ...) — resolution failing to find the entity IS the "not applicable to this pool" case, not a config flag. */
  readonly scrubRunningMetric?: MetricDef;
  readonly balanceRunningMetric?: MetricDef;
  readonly parityRunningMetric?: MetricDef;

  // Disk only.
  readonly powerStatusMetric?: MetricDef;
  readonly temperatureMetric?: MetricDef;
  readonly diskModelMetric?: MetricDef;
  readonly diskTypeMetric?: MetricDef;
  readonly diskSizeMetric?: MetricDef;
  readonly smartWarningMetric?: MetricDef;
  readonly preclearRunningMetric?: MetricDef;

  // Server only.
  /** The server's own three CPU-temperature readings (`sensor/system_health.py`) — confirmed `key === translation_key` for all three, unlike every guest/pool/disk field above. */
  readonly cpuTempMainMetric?: MetricDef;
  readonly cpuTempAverageMetric?: MetricDef;
  readonly cpuTempMaxMetric?: MetricDef;
}

/** Strips a known prefix off a translation_key to get its registered key — the pattern confirmed for every guest/pool/disk entity (see file header). */
const stripped = (translationKey: string, prefix: string): MetricDef => ({
  translationKey,
  keySuffix: translationKey.slice(prefix.length),
});

/** For the server's own CPU-temperature readings only — `key === translation_key` there, confirmed against `sensor/system_health.py` (unlike every guest/pool/disk field, which needs `stripped()`). */
const same = (key: string): MetricDef => ({ translationKey: key, keySuffix: key });

function guestKind(
  id: Exclude<DetailKindId, "pool" | "disk">,
  modelId: ModelId,
  name: string,
  icon: string,
): DetailKindDef {
  const prefix = `${id}_`;
  const guestMetric = (suffix: string) => stripped(`${prefix}${suffix}`, prefix);
  return {
    id,
    modelId,
    name,
    icon,
    stateMetric: guestMetric("state"),
    cpuMetric: guestMetric("cpu_usage"),
    memoryMetric: guestMetric("memory_usage"),
    powerMetric: guestMetric("power"),
    healthyMetric: id === "docker" || id === "compose" ? guestMetric("healthy") : undefined,
    updateAvailableMetric: id === "docker" || id === "compose" ? guestMetric("update_available") : undefined,
    autostartMetric: guestMetric("autostart"),
    hasRichAttributes: id === "docker" || id === "compose",
    hasEntityPicture: true,
  };
}

export const DETAIL_KIND_DEFS: Readonly<Record<DetailKindId, DetailKindDef>> = {
  docker: guestKind("docker", "docker_container", "Docker Container", "mdi:docker"),
  compose: {
    ...guestKind("compose", "compose_stack", "Compose Stack", "mdi:layers-triple"),
    runningContainersMetric: stripped("compose_running_containers", "compose_"),
    containerCountMetric: stripped("compose_container_count", "compose_"),
  },
  lxc: guestKind("lxc", "lxc_container", "LXC Container", "mdi:server"),
  vm: guestKind("vm", "virtual_machine", "Virtual Machine", "mdi:monitor"),
  pool: {
    id: "pool",
    modelId: "storage_pool",
    name: "Storage Pool",
    icon: "mdi:database",
    hasRichAttributes: false,
    hasEntityPicture: false,
    usageMetric: stripped("pool_usage", "pool_"),
    freeSpaceMetric: stripped("pool_free_space", "pool_"),
    totalSpaceMetric: stripped("pool_total_space", "pool_"),
    usedSpaceMetric: stripped("pool_used_space", "pool_"),
    poolTypeMetric: stripped("pool_type", "pool_"),
    poolProblemMetric: stripped("pool_problem", "pool_"),
    scrubRunningMetric: stripped("pool_scrub_running", "pool_"),
    balanceRunningMetric: stripped("pool_balance_running", "pool_"),
    parityRunningMetric: stripped("pool_parity_running", "pool_"),
  },
  disk: {
    id: "disk",
    modelId: "disk",
    name: "Disk",
    icon: "mdi:harddisk",
    hasRichAttributes: false,
    hasEntityPicture: false,
    powerStatusMetric: stripped("disk_power_status", "disk_"),
    temperatureMetric: stripped("disk_temperature", "disk_"),
    diskModelMetric: stripped("disk_model", "disk_"),
    diskTypeMetric: stripped("disk_type", "disk_"),
    diskSizeMetric: stripped("disk_size", "disk_"),
    smartWarningMetric: stripped("disk_smart_warning", "disk_"),
    preclearRunningMetric: stripped("disk_preclear_running", "disk_"),
  },
  server: {
    id: "server",
    name: "Server",
    icon: "mdi:server",
    hasRichAttributes: false,
    hasEntityPicture: false,
    cpuTempMainMetric: same("cpu_temperature"),
    cpuTempAverageMetric: same("cpu_temperature_average"),
    cpuTempMaxMetric: same("cpu_temperature_max"),
  },
};

/** The `DetailKindDef` for a device's own `model_id`, or `undefined` for a device this card doesn't know how to render (some other integration's device, or a future ha-mos kind not yet added here). */
export function findKindByModelId(modelId: string | null): DetailKindDef | undefined {
  if (!modelId) {
    return undefined;
  }
  return Object.values(DETAIL_KIND_DEFS).find((kind) => kind.modelId === modelId);
}
