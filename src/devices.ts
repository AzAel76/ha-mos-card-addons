/**
 * Device/entity registry discovery for the ha-mos integration.
 *
 * Architecture ported from the sibling `ha-mos-card` project (proven against
 * the real integration): devices are matched by `model_id` rather than name
 * or entity_id, and the MOS "server" device is identified as being the
 * `via_device_id` parent of any device carrying a known kind's `model_id` —
 * the server device itself carries no `model_id` of its own.
 *
 * Registries are fetched and kept live over the raw websocket (not
 * `hass.entities`/`hass.devices`, which aren't reliably present across
 * frontend versions) via `home-assistant-js-websocket`'s `createCollection`,
 * which dedupes concurrent subscribers sharing the same connection + cache
 * key — so every `mos-kind-title-card` on one dashboard shares a single
 * `config/device_registry/list` call rather than issuing one each.
 */
import { createCollection } from "home-assistant-js-websocket";
import type { Connection, UnsubscribeFunc } from "home-assistant-js-websocket";
import type { KindDef, MetricDef, ModelId } from "./kinds";

export interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  model_id: string | null;
  via_device_id: string | null;
  disabled_by: string | null;
}

export interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  translation_key?: string | null;
  unique_id?: string;
  disabled_by: string | null;
  hidden_by: string | null;
}

/** The host's total installed RAM, on the server device (not per-kind). */
export const SERVER_MEMORY_TOTAL: MetricDef = { translationKey: "memory_total", keySuffix: "memory_total" };

const KNOWN_MODEL_IDS: ReadonlySet<string> = new Set<ModelId>([
  "docker_container",
  "compose_stack",
  "lxc_container",
  "virtual_machine",
]);

// Cache keys are our own — deliberately not sharing ha-mos-card's, which is
// its own project's private implementation detail we shouldn't couple to.
export const subscribeDeviceRegistry = (
  conn: Connection,
  onChange: (devices: DeviceRegistryEntry[]) => void,
): UnsubscribeFunc =>
  createCollection<DeviceRegistryEntry[]>(
    "_mosKindTitleCardDeviceRegistry",
    (connection) => connection.sendMessagePromise<DeviceRegistryEntry[]>({ type: "config/device_registry/list" }),
    (connection, store) =>
      connection.subscribeEvents(
        () =>
          connection
            .sendMessagePromise<DeviceRegistryEntry[]>({ type: "config/device_registry/list" })
            .then((devices) => store.setState(devices, true)),
        "device_registry_updated",
      ),
    conn,
    onChange,
  );

export const subscribeEntityRegistry = (
  conn: Connection,
  onChange: (entities: EntityRegistryEntry[]) => void,
): UnsubscribeFunc =>
  createCollection<EntityRegistryEntry[]>(
    "_mosKindTitleCardEntityRegistry",
    (connection) => connection.sendMessagePromise<EntityRegistryEntry[]>({ type: "config/entity_registry/list" }),
    (connection, store) =>
      connection.subscribeEvents(
        () =>
          connection
            .sendMessagePromise<EntityRegistryEntry[]>({ type: "config/entity_registry/list" })
            .then((entities) => store.setState(entities, true)),
        "entity_registry_updated",
      ),
    conn,
    onChange,
  );

/** Every MOS server device: the `via_device_id` targets of kind-tagged devices. */
export function findServerDevices(devices: readonly DeviceRegistryEntry[]): DeviceRegistryEntry[] {
  const byId = new Map(devices.map((device) => [device.id, device]));
  const serverIds = new Set<string>();

  for (const device of devices) {
    if (device.model_id && KNOWN_MODEL_IDS.has(device.model_id) && device.via_device_id) {
      serverIds.add(device.via_device_id);
    }
  }

  return [...serverIds]
    .map((id) => byId.get(id))
    .filter((device): device is DeviceRegistryEntry => device !== undefined);
}

/** Every non-disabled guest device of one kind under one server. */
export function selectGuestDevices(
  devices: readonly DeviceRegistryEntry[],
  kind: KindDef,
  serverId: string,
): DeviceRegistryEntry[] {
  return devices.filter(
    (device) => device.disabled_by === null && device.model_id === kind.modelId && device.via_device_id === serverId,
  );
}

/** Index the entity registry by device, dropping entities that cannot render. */
export function entitiesByDevice(entities: readonly EntityRegistryEntry[]): Map<string, EntityRegistryEntry[]> {
  const index = new Map<string, EntityRegistryEntry[]>();

  for (const entity of entities) {
    if (!entity.device_id || entity.disabled_by !== null || entity.hidden_by !== null) {
      continue;
    }
    const existing = index.get(entity.device_id);
    if (existing) {
      existing.push(entity);
    } else {
      index.set(entity.device_id, [entity]);
    }
  }

  return index;
}

/**
 * Resolve one metric to its entity: translation_key first (survives renames),
 * unique_id suffix as the fallback for cores that omit translation_key from
 * the registry payload. No last-resort guess — a wrong match here would sum
 * or divide by a number that means something else entirely.
 */
export function findMetricEntity(
  entities: readonly EntityRegistryEntry[],
  metric: MetricDef,
): EntityRegistryEntry | undefined {
  return (
    entities.find((entity) => entity.translation_key === metric.translationKey) ??
    entities.find(
      (entity) => entity.entity_id.startsWith("sensor.") && entity.unique_id?.endsWith(`_${metric.keySuffix}`),
    )
  );
}

/** binary_sensor candidates on a device that could report a fault (checked against `problem` device_class at render time, which only the live state carries). */
export function findProblemBinarySensors(entities: readonly EntityRegistryEntry[]): EntityRegistryEntry[] {
  return entities.filter((entity) => entity.entity_id.startsWith("binary_sensor."));
}
