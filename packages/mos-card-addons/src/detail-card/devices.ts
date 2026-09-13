/**
 * See ../shared/devices.ts for the actual registry-discovery implementation.
 * This file adds what's specific to mos-detail-card: direct by-id device
 * lookup (this card is handed one already-known `device_id` directly rather
 * than discovering children of a chosen server), the structural "is this the
 * MOS server device" test, and this card's own domain-scoped
 * `findMetricEntity` fallback (`sensor.*` + `binary_sensor.*` + `switch.*`).
 */
import type { DeviceRegistryEntry, EntityRegistryEntry, MetricDef } from "../shared/devices";
import { findMetricEntityIn } from "../shared/devices";

export type { DeviceRegistryEntry, EntityRegistryEntry, MetricDef } from "../shared/devices";
export {
  subscribeDeviceRegistry,
  subscribeEntityRegistry,
  entitiesByDevice,
  selectDiskDevices,
  poolDisplayName,
  diskDisplayName,
} from "../shared/devices";

/** Direct lookup by device id — the normal path, since config hands us the device directly. */
export function findDeviceById(
  devices: readonly DeviceRegistryEntry[],
  deviceId: string,
): DeviceRegistryEntry | undefined {
  return devices.find((device) => device.id === deviceId);
}

/** Fallback for the rare case only an entity_id is available: resolves that entity's own device. */
export function findDeviceByEntityId(
  devices: readonly DeviceRegistryEntry[],
  entities: readonly EntityRegistryEntry[],
  entityId: string,
): DeviceRegistryEntry | undefined {
  const entity = entities.find((candidate) => candidate.entity_id === entityId);
  if (!entity?.device_id) {
    return undefined;
  }
  return findDeviceById(devices, entity.device_id);
}

/**
 * The `model_id`s of every kind-tagged device that names a MOS server as
 * its `via_device_id` parent — the server itself carries no `model_id` of
 * its own, so it can only be recognized structurally.
 */
const KNOWN_GUEST_POOL_DISK_MODEL_IDS: ReadonlySet<string> = new Set([
  "docker_container",
  "compose_stack",
  "lxc_container",
  "virtual_machine",
  "storage_pool",
  "disk",
]);

/** Whether `deviceId` is a MOS server device — identified as the `via_device_id` parent of at least one guest/pool/disk device, since it has no `model_id` of its own to match directly. */
export function isServerDevice(devices: readonly DeviceRegistryEntry[], deviceId: string): boolean {
  return devices.some(
    (device) =>
      device.model_id !== null &&
      KNOWN_GUEST_POOL_DISK_MODEL_IDS.has(device.model_id) &&
      device.via_device_id === deviceId,
  );
}

/**
 * The unique_id-suffix fallback matches `sensor.*`, `binary_sensor.*` (both
 * already needed by the sibling cards) and `switch.*` — this card's power
 * toggle is the first need for a `switch` entity in this repo.
 */
export function findMetricEntity(
  entities: readonly EntityRegistryEntry[],
  metric: MetricDef,
): EntityRegistryEntry | undefined {
  return findMetricEntityIn(entities, metric, ["sensor", "binary_sensor", "switch"]);
}
