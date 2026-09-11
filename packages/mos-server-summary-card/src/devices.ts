/**
 * Device/entity registry discovery for the ha-mos integration.
 *
 * Architecture ported from the sibling `mos-kind-title-card` package (itself
 * ported from `ha-mos-card`, proven against the real integration): devices
 * are matched by `model_id` rather than name or entity_id, and the MOS
 * "server" device is identified as being the `via_device_id` parent of any
 * device carrying a known kind's `model_id` — the server device itself
 * carries no `model_id` of its own.
 *
 * Extended here beyond mos-kind-title-card's set: this card also needs
 * storage pools and physical disks, which are their own dynamic devices
 * under the server (confirmed against ha-mos's `sensor/pools.py`,
 * `binary_sensor/pools.py`, `binary_sensor/disks.py` — same `via_device_id`
 * pattern as a Docker/Compose/LXC/VM guest device), and a generalized guest
 * lookup across every guest kind at once (for the cross-kind
 * updates/problems badge) rather than one kind at a time.
 *
 * Registries are fetched and kept live over the raw websocket (not
 * `hass.entities`/`hass.devices`, which aren't reliably present across
 * frontend versions) via `home-assistant-js-websocket`'s `createCollection`,
 * which dedupes concurrent subscribers sharing the same connection + cache
 * key — so every `mos-server-summary-card` on one dashboard shares a single
 * `config/device_registry/list` call rather than issuing one each.
 */
import { createCollection } from "home-assistant-js-websocket";
import type { Connection, UnsubscribeFunc } from "home-assistant-js-websocket";

export interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  model_id: string | null;
  via_device_id: string | null;
  disabled_by: string | null;
  /** The MOS server's own web UI base URL. Not currently used by this card, kept for parity with the device shape. */
  configuration_url: string | null;
}

export interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  translation_key?: string | null;
  unique_id?: string;
  disabled_by: string | null;
  hidden_by: string | null;
}

/** How to resolve one entity: translation_key first, unique_id suffix as fallback. */
export interface MetricDef {
  readonly translationKey: string;
  readonly keySuffix: string;
}

const GUEST_MODEL_IDS: ReadonlySet<string> = new Set([
  "docker_container",
  "compose_stack",
  "lxc_container",
  "virtual_machine",
]);

const POOL_MODEL_ID = "storage_pool";
const DISK_MODEL_ID = "disk";

const KNOWN_MODEL_IDS: ReadonlySet<string> = new Set([...GUEST_MODEL_IDS, POOL_MODEL_ID, DISK_MODEL_ID]);

// Cache keys are our own — deliberately distinct from mos-kind-title-card's
// (and from ha-mos-card's), so that two of these cards, or one of each
// package, sharing one dashboard don't couple through a private cache key
// string neither package treats as a public contract.
export const subscribeDeviceRegistry = (
  conn: Connection,
  onChange: (devices: DeviceRegistryEntry[]) => void,
): UnsubscribeFunc =>
  createCollection<DeviceRegistryEntry[]>(
    "_mosServerSummaryCardDeviceRegistry",
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
    "_mosServerSummaryCardEntityRegistry",
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

/** Every MOS server device: the `via_device_id` targets of kind-tagged devices (guests, pools, or disks). */
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

/** Every non-disabled guest device (any of Docker/Compose/LXC/VM) under one server — for the aggregate updates/problems badge, not per-kind detail. */
export function selectGuestDevices(devices: readonly DeviceRegistryEntry[], serverId: string): DeviceRegistryEntry[] {
  return devices.filter(
    (device) =>
      device.disabled_by === null &&
      device.model_id !== null &&
      GUEST_MODEL_IDS.has(device.model_id) &&
      device.via_device_id === serverId,
  );
}

/** Every non-disabled storage pool device under one server. Dynamic and unbounded — not a fixed 2-pool schema. */
export function selectPoolDevices(devices: readonly DeviceRegistryEntry[], serverId: string): DeviceRegistryEntry[] {
  return devices.filter(
    (device) => device.disabled_by === null && device.model_id === POOL_MODEL_ID && device.via_device_id === serverId,
  );
}

/** Every non-disabled physical disk device under one server. */
export function selectDiskDevices(devices: readonly DeviceRegistryEntry[], serverId: string): DeviceRegistryEntry[] {
  return devices.filter(
    (device) => device.disabled_by === null && device.model_id === DISK_MODEL_ID && device.via_device_id === serverId,
  );
}

/** Strips a leading "...Pool " (through its last occurrence) off a device name. */
const POOL_PREFIX = /^.*Pool /;

/**
 * A pool device's own name, e.g. "Pool Data" → "Data". ha-mos always names
 * the underlying device this way (confirmed in `sensor/pools.py`), but
 * `name_by_user` — what `poolDisplayName` prefers, since it's the name a
 * user actually sees and often renames — can carry a prefix ha-mos never
 * added, e.g. "MOSBEE Pool Data" (the server's own name, prepended by hand
 * or by Home Assistant's own device naming). Stripping through the *last*
 * "Pool " rather than requiring it as a strict prefix handles both;
 * falls back to the raw name when there's no "Pool " at all, rather than
 * mangling a fully custom rename.
 */
export function poolDisplayName(device: DeviceRegistryEntry): string {
  const name = device.name_by_user || device.name || "";
  return name.replace(POOL_PREFIX, "");
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
 *
 * Unlike mos-kind-title-card's version of this function, the fallback here
 * also accepts `binary_sensor.*` entities, not just `sensor.*` — this card
 * resolves several service/connectivity/problem binary sensors the same way.
 */
export function findMetricEntity(
  entities: readonly EntityRegistryEntry[],
  metric: MetricDef,
): EntityRegistryEntry | undefined {
  return (
    entities.find((entity) => entity.translation_key === metric.translationKey) ??
    entities.find(
      (entity) =>
        (entity.entity_id.startsWith("sensor.") || entity.entity_id.startsWith("binary_sensor.")) &&
        entity.unique_id?.endsWith(`_${metric.keySuffix}`),
    )
  );
}

/** binary_sensor candidates on a device that could report a fault (checked against `problem` device_class at render time, which only the live state carries). */
export function findProblemBinarySensors(entities: readonly EntityRegistryEntry[]): EntityRegistryEntry[] {
  return entities.filter((entity) => entity.entity_id.startsWith("binary_sensor."));
}
