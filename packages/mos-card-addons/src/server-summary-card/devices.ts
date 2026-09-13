/**
 * See ../shared/devices.ts for the actual registry-discovery implementation.
 * This file only adds mos-server-summary-card's own domain-scoped
 * `findMetricEntity` fallback (`sensor.*` + `binary_sensor.*`).
 */
import type { EntityRegistryEntry, MetricDef } from "../shared/devices";
import { findMetricEntityIn } from "../shared/devices";

export type { DeviceRegistryEntry, EntityRegistryEntry, MetricDef } from "../shared/devices";
export {
  subscribeDeviceRegistry,
  subscribeEntityRegistry,
  entitiesByDevice,
  findProblemBinarySensors,
  findServerDevices,
  selectGuestDevices,
  selectPoolDevices,
  selectDiskDevices,
  poolDisplayName,
} from "../shared/devices";

/**
 * The unique_id-suffix fallback also accepts `binary_sensor.*` entities, not
 * just `sensor.*` — this card resolves several service/connectivity/problem
 * binary sensors the same way.
 */
export function findMetricEntity(
  entities: readonly EntityRegistryEntry[],
  metric: MetricDef,
): EntityRegistryEntry | undefined {
  return findMetricEntityIn(entities, metric, ["sensor", "binary_sensor"]);
}
