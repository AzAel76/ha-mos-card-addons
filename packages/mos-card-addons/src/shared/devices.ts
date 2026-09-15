/**
 * Device/entity registry discovery for the ha-mos integration, shared by all
 * three cards.
 *
 * Architecture proven against the real integration (ported from the sibling
 * `ha-mos-card` project originally): devices are matched by `model_id`
 * rather than name or entity_id, and a MOS server device is identified as
 * being the `via_device_id` parent of any device carrying a known guest/
 * pool/disk `model_id` — the server device itself carries no `model_id` of
 * its own.
 *
 * Registries are fetched and kept live over the raw websocket (not
 * `hass.entities`/`hass.devices`, which aren't reliably present across
 * frontend versions) via `home-assistant-js-websocket`'s `createCollection`,
 * which dedupes concurrent subscribers sharing the same connection + cache
 * key — so every MOS card on one dashboard, of any of the three kinds,
 * shares a single `config/device_registry/list` call rather than each
 * issuing its own. (Before the three cards shared one bundle, each package
 * deliberately used its own cache key to avoid coupling standalone packages
 * through a private implementation detail with no shared release — now that
 * they always ship from the same build, sharing one key is a pure
 * efficiency win with no version-skew risk.)
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
  /** The MOS server's own web UI base URL — used by mos-kind-title-card to link to its per-kind pages (e.g. `/docker`). */
  configuration_url: string | null;
  /** `[domain, id]` pairs. Already present on every `config/device_registry/list` response; only mos-detail-card's disk/pool-linking needs to read it (see `diskSerial`), so it stayed untyped until now. */
  identifiers?: readonly (readonly [string, string])[];
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

/** Every model_id that can make a device its `via_device_id` parent a MOS server: guests plus pools/disks (a server with only storage, no guests, is still a server). */
const KNOWN_SERVER_CHILD_MODEL_IDS: ReadonlySet<string> = new Set([...GUEST_MODEL_IDS, POOL_MODEL_ID, DISK_MODEL_ID]);

export const subscribeDeviceRegistry = (
  conn: Connection,
  onChange: (devices: DeviceRegistryEntry[]) => void,
): UnsubscribeFunc =>
  createCollection<DeviceRegistryEntry[]>(
    "_mosCardsDeviceRegistry",
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
    "_mosCardsEntityRegistry",
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

/** Every MOS server device: the `via_device_id` targets of any guest/pool/disk device — the widest of the three cards' original criteria (mos-kind-title-card previously checked guests only, which missed a server exposing only pools/disks and no guests of any kind; that was a strict subset of this, never a case this makes worse). */
export function findServerDevices(devices: readonly DeviceRegistryEntry[]): DeviceRegistryEntry[] {
  const byId = new Map(devices.map((device) => [device.id, device]));
  const serverIds = new Set<string>();

  for (const device of devices) {
    if (device.model_id && KNOWN_SERVER_CHILD_MODEL_IDS.has(device.model_id) && device.via_device_id) {
      serverIds.add(device.via_device_id);
    }
  }

  return [...serverIds]
    .map((id) => byId.get(id))
    .filter((device): device is DeviceRegistryEntry => device !== undefined);
}

/** Every non-disabled guest device (any of Docker/Compose/LXC/VM) under one server — for an aggregate cross-kind badge, not per-kind detail. */
export function selectGuestDevices(devices: readonly DeviceRegistryEntry[], serverId: string): DeviceRegistryEntry[] {
  return devices.filter(
    (device) =>
      device.disabled_by === null &&
      device.model_id !== null &&
      GUEST_MODEL_IDS.has(device.model_id) &&
      device.via_device_id === serverId,
  );
}

/** Every non-disabled guest device of one specific kind under one server. */
export function selectGuestDevicesOfKind(
  devices: readonly DeviceRegistryEntry[],
  guestModelId: string,
  serverId: string,
): DeviceRegistryEntry[] {
  return devices.filter(
    (device) => device.disabled_by === null && device.model_id === guestModelId && device.via_device_id === serverId,
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

/** Strips a leading "...Disk " (through its last occurrence) off a device name — same rule as `poolDisplayName`, since `sensor/disks.py` names a disk device `f"Disk {name-or-serial}"` and a user's own rename can carry an arbitrary prefix in front of that. */
const DISK_PREFIX = /^.*Disk /;

/** A disk device's own display name, e.g. "MOSBEE Disk sdb" → "sdb". */
export function diskDisplayName(device: DeviceRegistryEntry): string {
  const name = device.name_by_user || device.name || "";
  return name.replace(DISK_PREFIX, "");
}

/**
 * A disk device's own physical serial, read off its registry `identifiers`
 * rather than its name or `name_by_user` — confirmed live against a real
 * MOS server that `disks.py` names a disk device after its Linux block
 * device (`sdb`, `nvme0n1`, ...), never the serial, so there is no
 * name-based shortcut here. `disks.py` registers the device's identifier as
 * `"{entry_id}_disk_{serial}"`; this is the same join key a pool's `usage`
 * sensor exposes as `member_disk_serials`/`parity_disk_serials` (confirmed
 * against ha-mos v0.3.2's `sensor/pools.py`), so this is what lets a pool
 * be resolved back to its actual disk devices. `undefined` for a device
 * with no `_disk_`-shaped identifier (i.e. not a disk device at all).
 */
export function diskSerial(device: DeviceRegistryEntry): string | undefined {
  for (const [, id] of device.identifiers ?? []) {
    const index = id.indexOf("_disk_");
    if (index !== -1) {
      return id.slice(index + "_disk_".length);
    }
  }
  return undefined;
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
 * `domains` is explicit and caller-supplied rather than a single fixed list:
 * the three cards need different unique_id-suffix domain fallbacks
 * (mos-kind-title-card: `sensor` only; mos-server-summary-card: + `binary_sensor`;
 * mos-detail-card: + `switch`, for its power toggle) and silently widening
 * all three to the union would let a call site match an entity domain it
 * never asked for — see each card's own `devices.ts` for its fixed list.
 */
export function findMetricEntityIn(
  entities: readonly EntityRegistryEntry[],
  metric: MetricDef,
  domains: readonly string[],
): EntityRegistryEntry | undefined {
  return (
    entities.find((entity) => entity.translation_key === metric.translationKey) ??
    entities.find(
      (entity) =>
        domains.some((domain) => entity.entity_id.startsWith(`${domain}.`)) &&
        entity.unique_id?.endsWith(`_${metric.keySuffix}`),
    )
  );
}

/** binary_sensor candidates on a device that could report a fault (checked against `problem` device_class at render time, which only the live state carries). */
export function findProblemBinarySensors(entities: readonly EntityRegistryEntry[]): EntityRegistryEntry[] {
  return entities.filter((entity) => entity.entity_id.startsWith("binary_sensor."));
}
