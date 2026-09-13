/**
 * See ../shared/devices.ts for the actual registry-discovery implementation.
 * This file only adds what's specific to mos-kind-title-card: the
 * sensor-only `findMetricEntity` domain fallback and the one metric this
 * card resolves directly on the server device rather than through a kind.
 */
import type { DeviceRegistryEntry, EntityRegistryEntry, MetricDef } from "../shared/devices";
import { findMetricEntityIn, selectGuestDevicesOfKind } from "../shared/devices";
import type { KindDef } from "./kinds";

export type { DeviceRegistryEntry, EntityRegistryEntry, MetricDef };
export {
  subscribeDeviceRegistry,
  subscribeEntityRegistry,
  entitiesByDevice,
  findProblemBinarySensors,
  findServerDevices,
} from "../shared/devices";

/** The host's total installed RAM, on the server device (not per-kind). */
export const SERVER_MEMORY_TOTAL: MetricDef = { translationKey: "memory_total", keySuffix: "memory_total" };

/** Every non-disabled guest device of this card's configured kind under one server. */
export function selectGuestDevices(
  devices: readonly DeviceRegistryEntry[],
  kind: KindDef,
  serverId: string,
): DeviceRegistryEntry[] {
  return selectGuestDevicesOfKind(devices, kind.modelId, serverId);
}

/** The unique_id-suffix fallback only matches `sensor.*` entities — this card never resolves a binary_sensor/switch metric. */
export function findMetricEntity(
  entities: readonly EntityRegistryEntry[],
  metric: MetricDef,
): EntityRegistryEntry | undefined {
  return findMetricEntityIn(entities, metric, ["sensor"]);
}
