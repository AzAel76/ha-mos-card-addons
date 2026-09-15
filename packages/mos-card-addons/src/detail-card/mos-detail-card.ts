import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { handleAction } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import "./gauge";
import "./sparkline";
import { severityColor } from "../shared/gauge";
import type { MosDetailCardConfig } from "./types";
import {
  diskDisplayName,
  diskSerial,
  entitiesByDevice,
  findDeviceById,
  findMetricEntity,
  isServerDevice,
  poolDisplayName,
  selectDiskDevices,
  subscribeDeviceRegistry,
  subscribeEntityRegistry,
} from "./devices";
import type { DeviceRegistryEntry, EntityRegistryEntry, MetricDef } from "./devices";
import { DETAIL_KIND_DEFS, findKindByModelId } from "./detail-kinds";
import type { DetailKindDef } from "./detail-kinds";
import { fetchHistory, HistoryBuffer } from "../shared/history";
import type { HistoryPoint } from "../shared/history";
import { formatBytes, formatSigFigs, stateToBytes } from "../shared/unit";
import { GestureTracker } from "./gesture";

const CARD_VERSION = "0.3.0"; // x-release-please-version

console.info(
  `%c MOS-DETAIL-CARD %c v${CARD_VERSION} `,
  "color: white; background: #039be5; font-weight: 700;",
  "color: #039be5; background: white; font-weight: 700;",
);

// Not one of detail-kinds.ts's per-kind fields since it lives on the
// *server* device, not the guest device itself — resolved separately, only
// for guest kinds, by walking the guest's own via_device_id.
const MEMORY_INSTALLED: MetricDef = { translationKey: "memory_installed", keySuffix: "memory_installed" };

// `sensor/hardware.py`'s generic `/sensors` readings all share this one
// translation_key per category (used only to pick an icon, confirmed
// against source) rather than each having its own unique key — so a
// temperature-category reading can only be found by filtering on it
// directly, never through `findMetricEntity`'s normal single-entity lookup.
const HARDWARE_TEMPERATURE_TRANSLATION_KEY = "hardware_temperature";

type ServerTemperatureGroup = "cpu" | "system" | "disk";

interface ServerTemperatureReading {
  label: string;
  entity: string;
  icon: string;
  historyCapable: boolean;
  group: ServerTemperatureGroup;
}

const SERVER_TEMPERATURE_GROUP_ORDER: readonly ServerTemperatureGroup[] = ["cpu", "system", "disk"];

const SERVER_TEMPERATURE_GROUP_LABELS: Record<ServerTemperatureGroup, string> = {
  cpu: "CPU",
  system: "System",
  disk: "Disk",
};

interface StatusBadge {
  icon: string;
  label: string;
  state: "on" | "off" | "warning";
}

/** One disk backing a pool (member or parity), resolved once in `_resolve()` — see its own comment for why this is a documented exception to entity ids only ever coming from registry data. */
interface PoolMemberDisk {
  label: string;
  usageEntity?: string;
  temperatureEntity?: string;
  powerStatusEntity?: string;
  modelEntity?: string;
  typeEntity?: string;
  sizeEntity?: string;
  smartWarningEntity?: string;
}

type PoolDiskAttribute = "model" | "type" | "size" | "power_status" | "smart_warning" | "temperature";

/** What discovery resolved for the configured device. Recomputed only when the registries or config change, never on a bare `hass` tick. */
interface Resolved {
  deviceFound: boolean;
  deviceName: string;
  kindDef?: DetailKindDef;
  /** `config.kind` was set but doesn't match what the device's own `model_id` (or, for the MOS server device itself, its structural role — see `isServerDevice`) actually auto-detects to. Rendering as if the override were correct would resolve zero real entities and look like a broken, near-empty card with no indication why — see mos-detail-card.ts's render() for the warning this triggers instead. */
  kindOverrideMismatch: boolean;
  stateEntity?: string;
  cpuEntity?: string;
  memoryEntity?: string;
  /** Host total RAM, resolved from the guest's parent server device — lets memory_usage (raw bytes) render as a percentage gauge, same as mos-kind-title-card's host-relative memory gauge. */
  memoryTotalEntity?: string;
  powerEntity?: string;
  healthyEntity?: string;
  updateAvailableEntity?: string;
  autostartEntity?: string;
  usageEntity?: string;
  freeSpaceEntity?: string;
  totalSpaceEntity?: string;
  usedSpaceEntity?: string;
  poolTypeEntity?: string;
  poolProblemEntity?: string;
  scrubRunningEntity?: string;
  balanceRunningEntity?: string;
  parityRunningEntity?: string;
  powerStatusEntity?: string;
  temperatureEntity?: string;
  diskModelEntity?: string;
  diskTypeEntity?: string;
  diskSizeEntity?: string;
  smartWarningEntity?: string;
  preclearRunningEntity?: string;
  /** Compose only. */
  runningContainersEntity?: string;
  containerCountEntity?: string;
  /** Server only. */
  cpuTempMainEntity?: string;
  cpuTempAverageEntity?: string;
  cpuTempMaxEntity?: string;
  /** One entry per physical disk device under the server, label already resolved (device registry names are known ahead of render, unlike the hardware-sensor entities below). */
  diskTemperatures?: { label: string; entity: string }[];
  /** Entity IDs only, from `hardware.py`'s generic `/sensors` readings — each one's display name is assigned by MOS at runtime rather than a static translatable string, so it can only be read live off `hass.states[...].attributes.friendly_name`, not resolved ahead of time like every other label in this card. */
  hardwareTemperatureEntities?: string[];
  /** Pool only: the disks actually backing this pool (ha-mos v0.3.2+), resolved from the pool's own usage-entity attributes — see `_resolve()`. `undefined` on an older ha-mos that doesn't report them; `[]` for a pool ha-mos reports with none. */
  poolMemberDisks?: PoolMemberDisk[];
  poolParityDisks?: PoolMemberDisk[];
}

function stateOf(hass: HomeAssistant, entityId: string | undefined): string | undefined {
  return entityId ? hass.states[entityId]?.state : undefined;
}

function isOn(hass: HomeAssistant, entityId: string | undefined): boolean {
  return stateOf(hass, entityId) === "on";
}

/** A disk's icon by its own `disk_type` reading (ha-mos's raw pass-through of MOS's own type string — "NVME"/"SSD"/"USB" seen in practice, matched case-insensitively since it isn't a declared enum) — mirrors the type-specific icons MOS's own web UI disk table uses, rather than one generic harddisk icon for every disk. */
function diskTypeIcon(type: string | undefined): string {
  switch ((type ?? "").toLowerCase()) {
    case "nvme":
      return "mdi:expansion-card";
    case "usb":
      return "mdi:usb-flash-drive";
    case "ssd":
    case "hdd":
    default:
      return "mdi:harddisk";
  }
}

@customElement("mos-detail-card")
export class MosDetailCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: MosDetailCardConfig;
  @state() private _devices: DeviceRegistryEntry[] = [];
  @state() private _entities: EntityRegistryEntry[] = [];
  @state() private _registriesLoaded = false;

  private _unsubDevices?: UnsubscribeFunc;
  private _unsubEntities?: UnsubscribeFunc;
  private _resolved?: Resolved;

  /** The single history series this card plots — CPU usage for a guest, usage % for a pool. Memory usage is a raw byte value, not a fixed 0-100 scale, and history is fetched with `no_attributes: true` (see history.ts), so there's no reliable per-point unit to normalize it against; it's shown as a current-value stat only, never as a sparkline. */
  private _history?: HistoryBuffer;
  private _historyKey?: string;
  private _lastHistorySample?: number;

  private _cardGesture = new GestureTracker();

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement("mos-detail-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): Partial<MosDetailCardConfig> {
    return {};
  }

  public setConfig(config: MosDetailCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = config;
  }

  public getCardSize(): number {
    return 3;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribe();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubDevices?.();
    this._unsubDevices = undefined;
    this._unsubEntities?.();
    this._unsubEntities = undefined;
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass")) {
      this._subscribe();
    }
  }

  /** Idempotent: setConfig can run before `hass` exists, and connection order isn't guaranteed. */
  private _subscribe(): void {
    if (!this.isConnected || !this.hass?.connection) {
      return;
    }
    // custom-card-helpers bundles its own (older) home-assistant-js-websocket,
    // so `hass.connection`'s Connection type is nominally distinct from ours
    // even though the runtime object is identical — bridge the duplicate-
    // dependency type clash with a cast rather than pinning our own version
    // down to their much older one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connection = this.hass.connection as any;
    if (!this._unsubDevices) {
      this._unsubDevices = subscribeDeviceRegistry(connection, (devices) => {
        this._registriesLoaded = true;
        this._devices = devices;
      });
    }
    if (!this._unsubEntities) {
      this._unsubEntities = subscribeEntityRegistry(connection, (entities) => {
        this._entities = entities;
      });
    }
  }

  /**
   * Re-run discovery only when the registries or config actually changed —
   * never on a bare `hass` tick, since re-scanning the full device/entity
   * arrays every second (for values that render() already reads live off
   * `hass.states`) would be pure waste.
   */
  protected willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("_devices") || changed.has("_entities") || changed.has("_config")) {
      this._resolved = this._resolve();
    }
    this._maybeFetchHistory();
  }

  private _resolve(): Resolved | undefined {
    const deviceId = this._config?.device_id;
    if (!deviceId) {
      return undefined;
    }

    const device = findDeviceById(this._devices, deviceId);
    const deviceFound = device !== undefined;
    const byDevice = entitiesByDevice(this._entities);
    const deviceEntities = byDevice.get(deviceId) ?? [];

    // The server has no model_id of its own, so it's only recognized once
    // model_id-based detection has already failed — a structural check
    // (isServerDevice), not a second entry findKindByModelId could ever match.
    const detectedKindDef =
      findKindByModelId(device?.model_id ?? null) ??
      (device && isServerDevice(this._devices, deviceId) ? DETAIL_KIND_DEFS.server : undefined);
    // A mismatch (including the device having no detectable kind at all)
    // means the override is almost certainly wrong for this device_id, not
    // a deliberate nudge — see the Resolved field's own comment.
    const kindOverrideMismatch = !!this._config.kind && detectedKindDef?.id !== this._config.kind;
    const kindDef = this._config.kind ? DETAIL_KIND_DEFS[this._config.kind] : detectedKindDef;

    const metric = (def: MetricDef | undefined) => (def ? findMetricEntity(deviceEntities, def)?.entity_id : undefined);

    let memoryTotalEntity: string | undefined;
    if (kindDef?.memoryMetric && device?.via_device_id) {
      const serverEntities = byDevice.get(device.via_device_id) ?? [];
      memoryTotalEntity = findMetricEntity(serverEntities, MEMORY_INSTALLED)?.entity_id;
    }

    const deviceName =
      device?.name_by_user ||
      device?.name ||
      (kindDef?.id === "pool" && device ? poolDisplayName(device) : undefined) ||
      deviceId;

    let diskTemperatures: { label: string; entity: string }[] | undefined;
    let hardwareTemperatureEntities: string[] | undefined;
    if (kindDef?.id === "server") {
      const diskTempMetric = DETAIL_KIND_DEFS.disk.temperatureMetric;
      diskTemperatures = diskTempMetric
        ? selectDiskDevices(this._devices, deviceId)
            .map((disk) => {
              const entity = findMetricEntity(byDevice.get(disk.id) ?? [], diskTempMetric)?.entity_id;
              return entity ? { label: diskDisplayName(disk), entity } : undefined;
            })
            .filter((reading): reading is { label: string; entity: string } => reading !== undefined)
        : [];
      hardwareTemperatureEntities = deviceEntities
        .filter((entity) => entity.translation_key === HARDWARE_TEMPERATURE_TRANSLATION_KEY)
        .map((entity) => entity.entity_id);
    }

    const usageEntity = metric(kindDef?.usageMetric);

    // Pool only: the disks actually backing this pool, per ha-mos v0.3.2's
    // member_disk_serials/parity_disk_serials attributes on the usage
    // sensor (closes anym001/ha-mos#117). Read here, once, rather than at
    // render time: pool membership is a live entity attribute, not registry
    // data, but re-deriving it only when the registry/config actually
    // changes (this method's only call site) is the same tradeoff every
    // other resolved entity id here already makes, and membership changes
    // are rare/administrative rather than a live-updating value. A disk's
    // own serial is never exposed on any disk entity (confirmed live: MOS
    // names a disk device after its Linux block name — "sdb", "nvme0n1" —
    // never the serial), only baked into its registry `identifiers`, hence
    // `diskSerial()` rather than a name-based lookup.
    let poolMemberDisks: PoolMemberDisk[] | undefined;
    let poolParityDisks: PoolMemberDisk[] | undefined;
    if (kindDef?.id === "pool" && device?.via_device_id && usageEntity) {
      const disksBySerial = new Map<string, DeviceRegistryEntry>();
      for (const disk of selectDiskDevices(this._devices, device.via_device_id)) {
        const serial = diskSerial(disk);
        if (serial) disksBySerial.set(serial, disk);
      }
      const resolvePoolDisk = (serial: string): PoolMemberDisk | undefined => {
        const diskDevice = disksBySerial.get(serial);
        if (!diskDevice) return undefined;
        const diskEntities = byDevice.get(diskDevice.id) ?? [];
        const diskMetric = (def: MetricDef | undefined) =>
          def ? findMetricEntity(diskEntities, def)?.entity_id : undefined;
        return {
          label: diskDisplayName(diskDevice),
          usageEntity: diskMetric(DETAIL_KIND_DEFS.disk.usageMetric),
          temperatureEntity: diskMetric(DETAIL_KIND_DEFS.disk.temperatureMetric),
          powerStatusEntity: diskMetric(DETAIL_KIND_DEFS.disk.powerStatusMetric),
          modelEntity: diskMetric(DETAIL_KIND_DEFS.disk.diskModelMetric),
          typeEntity: diskMetric(DETAIL_KIND_DEFS.disk.diskTypeMetric),
          sizeEntity: diskMetric(DETAIL_KIND_DEFS.disk.diskSizeMetric),
          smartWarningEntity: diskMetric(DETAIL_KIND_DEFS.disk.smartWarningMetric),
        };
      };
      const attributes = this.hass.states[usageEntity]?.attributes ?? {};
      const memberSerials = (attributes.member_disk_serials as string[] | undefined) ?? [];
      const paritySerials = (attributes.parity_disk_serials as string[] | undefined) ?? [];
      poolMemberDisks = memberSerials.map(resolvePoolDisk).filter((disk): disk is PoolMemberDisk => disk !== undefined);
      poolParityDisks = paritySerials.map(resolvePoolDisk).filter((disk): disk is PoolMemberDisk => disk !== undefined);
    }

    return {
      deviceFound,
      deviceName,
      kindDef,
      kindOverrideMismatch,
      stateEntity: metric(kindDef?.stateMetric),
      cpuEntity: metric(kindDef?.cpuMetric),
      memoryEntity: metric(kindDef?.memoryMetric),
      memoryTotalEntity,
      powerEntity: metric(kindDef?.powerMetric),
      healthyEntity: metric(kindDef?.healthyMetric),
      updateAvailableEntity: metric(kindDef?.updateAvailableMetric),
      autostartEntity: metric(kindDef?.autostartMetric),
      usageEntity,
      freeSpaceEntity: metric(kindDef?.freeSpaceMetric),
      totalSpaceEntity: metric(kindDef?.totalSpaceMetric),
      usedSpaceEntity: metric(kindDef?.usedSpaceMetric),
      poolTypeEntity: metric(kindDef?.poolTypeMetric),
      poolProblemEntity: metric(kindDef?.poolProblemMetric),
      scrubRunningEntity: metric(kindDef?.scrubRunningMetric),
      balanceRunningEntity: metric(kindDef?.balanceRunningMetric),
      parityRunningEntity: metric(kindDef?.parityRunningMetric),
      powerStatusEntity: metric(kindDef?.powerStatusMetric),
      temperatureEntity: metric(kindDef?.temperatureMetric),
      diskModelEntity: metric(kindDef?.diskModelMetric),
      diskTypeEntity: metric(kindDef?.diskTypeMetric),
      diskSizeEntity: metric(kindDef?.diskSizeMetric),
      smartWarningEntity: metric(kindDef?.smartWarningMetric),
      preclearRunningEntity: metric(kindDef?.preclearRunningMetric),
      runningContainersEntity: metric(kindDef?.runningContainersMetric),
      containerCountEntity: metric(kindDef?.containerCountMetric),
      cpuTempMainEntity: metric(kindDef?.cpuTempMainMetric),
      cpuTempAverageEntity: metric(kindDef?.cpuTempAverageMetric),
      cpuTempMaxEntity: metric(kindDef?.cpuTempMaxMetric),
      diskTemperatures,
      hardwareTemperatureEntities,
      poolMemberDisks,
      poolParityDisks,
    };
  }

  /**
   * The one percentage-scale entity this card can safely plot — see the
   * `_history` field's own comment for why memory usage never qualifies.
   * The server kind's Main CPU-temperature reading only counts when
   * `cpu_temp_detail_style === "history"`, mirroring how that layout is the
   * only one of the three that shows a sparkline at all.
   */
  private _historyEntity(resolved: Resolved | undefined): string | undefined {
    if (resolved?.cpuEntity) {
      return resolved.cpuEntity;
    }
    if (resolved?.usageEntity) {
      return resolved.usageEntity;
    }
    if (resolved?.kindDef?.id === "server" && (this._config.cpu_temp_detail_style ?? "bars") === "history") {
      return resolved.cpuTempMainEntity;
    }
    return undefined;
  }

  /**
   * Fetches history once per (entity, window) pair — not on every render —
   * then hands off to HistoryBuffer, which extends the window locally from
   * live ticks afterward (see history.ts). Fire-and-forget: `requestUpdate()`
   * on completion is what actually shows the fetched trend line, since
   * willUpdate can't await this render pass.
   */
  private _maybeFetchHistory(): void {
    const resolved = this._resolved;
    const hours = this._config?.history_hours ?? 3;
    const entityId = this._historyEntity(resolved);
    const key = `${entityId ?? ""}|${hours}`;
    if (key === this._historyKey || !entityId || !this.hass?.connection) {
      return;
    }
    this._historyKey = key;

    const windowMs = hours * 60 * 60 * 1000;
    this._history = new HistoryBuffer(windowMs);
    this._lastHistorySample = undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connection = this.hass.connection as any;
    fetchHistory(connection, [entityId], hours)
      .then((points) => {
        this._history?.seed(points[entityId] ?? []);
        this.requestUpdate();
      })
      .catch(() => {
        // History is a nice-to-have trend line, not load-bearing data — a
        // failed fetch (e.g. recorder disabled) just means no sparkline.
      });
  }

  /** Appends the current live state to the history buffer, once per actual sample (guarded by last_updated, not by render count). */
  private _sampleHistory(entityId: string | undefined): readonly HistoryPoint[] | undefined {
    const buffer = this._history;
    if (!buffer || !entityId) {
      return buffer?.get();
    }
    const stateObj = this.hass.states[entityId];
    const value = Number(stateObj?.state);
    const lastUpdated = stateObj?.last_updated ? new Date(stateObj.last_updated).getTime() : undefined;
    if (Number.isFinite(value) && lastUpdated !== undefined && lastUpdated !== this._lastHistorySample) {
      buffer.push(value, lastUpdated);
      this._lastHistorySample = lastUpdated;
    }
    return buffer.get();
  }

  private _togglePower(entityId: string, e: Event): void {
    e.stopPropagation();
    const turningOn = !isOn(this.hass, entityId);
    this.hass.callService("switch", turningOn ? "turn_on" : "turn_off", { entity_id: entityId });
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    if (!this._config.device_id) {
      return this._shell(html`<ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>Select a device</span>`);
    }
    if (!this._registriesLoaded) {
      return this._shell(html`<span>Loading…</span>`);
    }
    const resolved = this._resolved;
    if (!resolved || !resolved.deviceFound) {
      return this._shell(html`<ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>Device not found</span>`);
    }
    if (!resolved.kindDef) {
      return this._shell(html`<ha-icon icon="mdi:help-circle-outline"></ha-icon><span>Unsupported device kind</span>`);
    }
    if (resolved.kindOverrideMismatch) {
      return this._shell(html`
        <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
        <span
          >"${this._config.kind}" kind override doesn't match this device ("${resolved.deviceName}") — remove
          <code>kind</code> to auto-detect, or pick a different device.</span
        >
      `);
    }
    return this._renderCard(resolved, resolved.kindDef);
  }

  private _shell(content: unknown) {
    return html`<ha-card><div class="empty">${content}</div></ha-card>`;
  }

  private _isGuest(kindDef: DetailKindDef): boolean {
    return kindDef.id === "docker" || kindDef.id === "compose" || kindDef.id === "lxc" || kindDef.id === "vm";
  }

  private _renderCard(resolved: Resolved, kindDef: DetailKindDef) {
    // show_identity/show_status are no-ops for the pool kind: _renderPoolDetail
    // folds identity (title, filesystem type) and status (problem/scrub/
    // balance/parity badges) into its own consolidated header instead —
    // show_stats is what gates that whole block, since it's the direct
    // replacement for what show_stats used to control for pools.
    const showIdentity = this._config.show_identity ?? true;
    const showStats = this._config.show_stats ?? true;
    const showContainers = this._config.show_containers ?? true;
    const showStatus = this._config.show_status ?? true;
    const showPowerToggle = this._config.show_power_toggle ?? true;

    const cardGestureHandlers = this._cardGesture.handlers((action) => {
      handleAction(this, this.hass, this._config, action);
    });

    return html`
      <ha-card
        @pointerdown=${cardGestureHandlers.onPointerDown}
        @pointerup=${cardGestureHandlers.onPointerUp}
        @pointercancel=${cardGestureHandlers.onPointerCancel}
      >
        ${showIdentity && kindDef.id !== "pool" ? this._renderIdentity(resolved, kindDef) : nothing}
        ${
          showStats
            ? kindDef.id === "disk"
              ? this._renderDiskStats(resolved)
              : kindDef.id === "server"
                ? this._renderServerStats(resolved)
                : kindDef.id === "pool"
                  ? this._renderPoolDetail(resolved)
                  : this._renderMetrics(resolved, kindDef)
            : nothing
        }
        ${showContainers ? this._renderContainers(resolved, kindDef) : nothing}
        ${showStatus && kindDef.id !== "pool" ? this._renderStatus(resolved, kindDef) : nothing}
        ${showPowerToggle && resolved.powerEntity ? this._renderPowerToggle(resolved.powerEntity) : nothing}
      </ha-card>
    `;
  }

  /** "3 / 4 running" for a Compose stack, or `undefined` while neither counter has resolved. Shared by the stats-row and identity-subtitle placements so the two `container_count_style` options never disagree on wording. */
  private _containerCountText(resolved: Resolved): string | undefined {
    const running = resolved.runningContainersEntity ? stateOf(this.hass, resolved.runningContainersEntity) : undefined;
    const total = resolved.containerCountEntity ? stateOf(this.hass, resolved.containerCountEntity) : undefined;
    if (running === undefined && total === undefined) {
      return undefined;
    }
    return `${running ?? "–"} / ${total ?? "–"} running`;
  }

  private _renderIdentity(resolved: Resolved, kindDef: DetailKindDef) {
    const hass = this.hass;
    const title = this._config.title || resolved.deviceName;
    const stateObj = resolved.stateEntity ? hass.states[resolved.stateEntity] : undefined;
    const picture = kindDef.hasEntityPicture ? stateObj?.attributes.entity_picture : undefined;

    const attributes: { label: string; value: string }[] = [];
    if (kindDef.hasRichAttributes && stateObj) {
      const imageDescription = stateObj.attributes.image_description as string | undefined;
      const repo = stateObj.attributes.repo as string | undefined;
      const networkMode = stateObj.attributes.network_mode as string | undefined;
      if (imageDescription) attributes.push({ label: "Image", value: imageDescription });
      if (repo) attributes.push({ label: "Repo", value: repo });
      if (networkMode) attributes.push({ label: "Network", value: networkMode });
    }
    if (kindDef.id === "disk") {
      const model = stateOf(hass, resolved.diskModelEntity);
      const type = stateOf(hass, resolved.diskTypeEntity);
      const size = stateToBytes(resolved.diskSizeEntity ? hass.states[resolved.diskSizeEntity] : undefined);
      if (model) attributes.push({ label: "Model", value: model });
      if (type) attributes.push({ label: "Type", value: type });
      if (size !== undefined) {
        const formatted = formatBytes(size);
        attributes.push({ label: "Size", value: `${formatted.value} ${formatted.unit}` });
      }
    }
    // Pool's filesystem type shows in _renderPoolDetail's own header instead — see _renderCard's comment on why show_identity is a no-op for pool.

    const webUiUrl = stateObj?.attributes.web_ui_url as string | undefined;
    const stateText = this._isGuest(kindDef) ? stateOf(hass, resolved.stateEntity) : undefined;
    const containerCountSubtitle =
      kindDef.id === "compose" && (this._config.container_count_style ?? "stats") === "subtitle"
        ? this._containerCountText(resolved)
        : undefined;

    return html`
      <div class="identity">
        <div class="icon-wrap">
          ${
            picture
              ? html`<img class="picture" src=${picture} alt="" />`
              : html`<ha-icon class="fallback-icon" icon=${kindDef.icon}></ha-icon>`
          }
        </div>
        <div class="identity-text">
          <div class="title-row">
            <span class="title">${title}</span>
            ${stateText ? html`<span class="state-chip state-${stateText}">${stateText}</span>` : nothing}
            ${
              webUiUrl
                ? html`<a
                    class="web-ui-link"
                    href=${webUiUrl}
                    target="_blank"
                    rel="noreferrer"
                    @click=${(e: Event) => e.stopPropagation()}
                  >
                    <ha-icon icon="mdi:open-in-new"></ha-icon>
                  </a>`
                : nothing
            }
          </div>
          ${containerCountSubtitle ? html`<div class="container-count-subtitle">${containerCountSubtitle}</div>` : nothing}
          ${
            attributes.length
              ? html`<div class="attributes">
                  ${attributes.map((attr) => html`<span class="attribute"><span class="attribute-label">${attr.label}:</span> ${attr.value}</span>`)}
                </div>`
              : nothing
          }
        </div>
      </div>
    `;
  }

  /**
   * One gauge/icon + label/value(+sub) + optional sparkline row, matching
   * `mos-server-summary-card`'s CPU/memory metric-row layout — a labeled
   * sparkline belongs to the row it measures, not a separate unlabeled block.
   */
  private _metricRow(opts: { gauge: unknown; label: string; value: unknown; sub?: unknown; sparkline?: unknown }) {
    return html`
      <div class="metric-row">
        <div class="gauge">${opts.gauge}</div>
        <div class="metric-info">
          <div class="metric-label">${opts.label}</div>
          <div class="metric-value">${opts.value}</div>
          ${opts.sub ? html`<div class="metric-sub">${opts.sub}</div>` : nothing}
        </div>
        ${opts.sparkline ?? nothing}
      </div>
    `;
  }

  /** A metric row's sparkline, or `undefined` when history is off *or* there isn't yet enough data to draw a line — `<mos-detail-sparkline>` already renders nothing internally below 2 points, but it still carries its own explicit `height`, so a caller placing it in its own block (rather than inline beside a gauge, where an empty slot is invisible next to other content) would otherwise show a bare reserved-but-empty gap while history is still loading. `valueScaleLabels` overrides the default "100"/"0" text for a non-percentage series still plotted against that same fixed range (the server kind's CPU-temperature sparkline). */
  private _sparklineFor(entityId: string, color: string, valueScaleLabels?: { top: string; bottom: string }) {
    if (!(this._config.show_history ?? true)) {
      return undefined;
    }
    const points = this._sampleHistory(entityId);
    if (!points || points.length < 2) {
      return undefined;
    }
    const showTimeScale = this._config.sparkline_show_time_scale ?? false;
    return html`
      <mos-detail-sparkline
        class="sparkline"
        style="height: ${showTimeScale ? "40px" : "30px"}"
        .points=${points ?? []}
        .showValueScale=${this._config.sparkline_show_value_scale ?? false}
        .showTimeScale=${showTimeScale}
        value-scale-top-label=${valueScaleLabels?.top ?? "100"}
        value-scale-bottom-label=${valueScaleLabels?.bottom ?? "0"}
        color=${color}
      ></mos-detail-sparkline>
    `;
  }

  /** Guest kinds only: metric-rows for CPU/memory, each with its own gauge, label, and (kind-permitting) labeled sparkline. Disk uses `_renderDiskStats`, server uses `_renderServerStats`, pool uses `_renderPoolDetail` — none has a gauge-worthy percentage metric shaped like this one. */
  private _renderMetrics(resolved: Resolved, kindDef: DetailKindDef) {
    const hass = this.hass;
    const rows: unknown[] = [];

    if (this._isGuest(kindDef)) {
      if (resolved.cpuEntity) {
        const cpuPct = Number(stateOf(hass, resolved.cpuEntity));
        rows.push(
          this._metricRow({
            gauge: html`<mos-detail-gauge .value=${cpuPct} icon="mdi:chip"></mos-detail-gauge>`,
            label: "CPU",
            value: Number.isFinite(cpuPct) ? html`${formatSigFigs(cpuPct)}<span class="stat-unit">%</span>` : "–",
            sparkline: this._sparklineFor(resolved.cpuEntity, "var(--red-color, #e53935)"),
          }),
        );
      }
      if (resolved.memoryEntity) {
        const memoryBytes = stateToBytes(hass.states[resolved.memoryEntity]);
        const memoryTotalBytes = stateToBytes(
          resolved.memoryTotalEntity ? hass.states[resolved.memoryTotalEntity] : undefined,
        );
        const memoryPct =
          memoryBytes !== undefined && memoryTotalBytes
            ? Math.min(100, (memoryBytes / memoryTotalBytes) * 100)
            : undefined;
        const memoryFormatted = memoryBytes !== undefined ? formatBytes(memoryBytes) : undefined;
        rows.push(
          this._metricRow({
            gauge: html`<mos-detail-gauge .value=${memoryPct} icon="mdi:memory"></mos-detail-gauge>`,
            label: "Memory",
            value: memoryFormatted
              ? html`${memoryFormatted.value}<span class="stat-unit">${memoryFormatted.unit}</span>`
              : "–",
          }),
        );
      }
      if (kindDef.id === "compose" && (this._config.container_count_style ?? "stats") === "stats") {
        const text = this._containerCountText(resolved);
        if (text) {
          rows.push(
            this._metricRow({
              gauge: html`<ha-icon icon="mdi:layers-triple"></ha-icon>`,
              label: "Containers",
              value: text,
            }),
          );
        }
      }
    }

    if (rows.length === 0) {
      return nothing;
    }
    return html`<div class="metrics">${rows}</div>`;
  }

  /** Pool only: problem/scrub/balance/parity-running badges — same data `_renderStatus` used to show as a separate block, now folded into `_renderPoolDetail`'s own header (show_status is a no-op for pool, see `_renderCard`). */
  private _poolStatusBadges(resolved: Resolved): StatusBadge[] {
    const hass = this.hass;
    const badges: StatusBadge[] = [];
    if (resolved.poolProblemEntity && isOn(hass, resolved.poolProblemEntity)) {
      badges.push({ icon: "mdi:alert-circle-outline", label: "Problem detected", state: "warning" });
    }
    if (resolved.scrubRunningEntity && isOn(hass, resolved.scrubRunningEntity)) {
      badges.push({ icon: "mdi:magnify-scan", label: "Scrub running", state: "on" });
    }
    if (resolved.balanceRunningEntity && isOn(hass, resolved.balanceRunningEntity)) {
      badges.push({ icon: "mdi:scale-balance", label: "Balance running", state: "on" });
    }
    if (resolved.parityRunningEntity && isOn(hass, resolved.parityRunningEntity)) {
      badges.push({ icon: "mdi:sync", label: "Parity check running", state: "on" });
    }
    return badges;
  }

  /**
   * The pool kind's dedicated layout (replaces identity/metrics/status for
   * this kind — see `_renderCard`'s comment): a gauge+title+state header,
   * then (per `show_pool_disks`/`pool_disk_detail`) the parity and member
   * disks actually backing this pool, resolved in `_resolve()` from ha-mos
   * v0.3.2's `member_disk_serials`/`parity_disk_serials` pool attributes.
   * Both groups are structurally absent (not just empty) on an older
   * ha-mos or a pool with no device lists, so they simply don't render —
   * no version gate needed.
   */
  private _renderPoolDetail(resolved: Resolved) {
    const hass = this.hass;
    const title = this._config.title || resolved.deviceName;
    const usagePct = resolved.usageEntity ? Number(stateOf(hass, resolved.usageEntity)) : NaN;
    const usedBytes = stateToBytes(resolved.usedSpaceEntity ? hass.states[resolved.usedSpaceEntity] : undefined);
    const totalBytes = stateToBytes(resolved.totalSpaceEntity ? hass.states[resolved.totalSpaceEntity] : undefined);
    const usedFormatted = usedBytes !== undefined ? formatBytes(usedBytes) : undefined;
    const totalFormatted = totalBytes !== undefined ? formatBytes(totalBytes) : undefined;
    const poolType = stateOf(hass, resolved.poolTypeEntity);
    const badges = this._poolStatusBadges(resolved);

    const showPoolDisks = this._config.show_pool_disks ?? true;
    const diskLayout = this._config.pool_disk_layout ?? "rows";
    const diskValueStyle = this._config.pool_disk_value_style ?? "bar";
    const diskAttributes = this._config.pool_disk_attributes ?? ["model", "size"];

    const sparkline = resolved.usageEntity
      ? this._sparklineFor(resolved.usageEntity, "var(--info-color, #039be5)")
      : undefined;

    return html`
      <div class="pool-detail">
        <div class="identity pool-header">
          <div class="icon-wrap">
            <ha-icon class="fallback-icon" icon="mdi:database"></ha-icon>
          </div>
          <div class="identity-text">
            <div class="title-row">
              <span class="title">${title}</span>
              ${poolType ? html`<span class="state-chip">${poolType}</span>` : nothing}
            </div>
            ${
              badges.length
                ? html`<div class="status">
                    ${badges.map(
                      (badge) =>
                        html`<span class="badge ${badge.state}"
                          ><ha-icon icon=${badge.icon}></ha-icon>${badge.label}</span
                        >`,
                    )}
                  </div>`
                : nothing
            }
          </div>
          <div class="pool-header-gauge">
            <div class="gauge">
              <mos-detail-gauge .value=${usagePct} icon="mdi:database"></mos-detail-gauge>
            </div>
            <div class="pool-header-gauge-stat">
              <div class="metric-value">
                ${Number.isFinite(usagePct) ? html`${formatSigFigs(usagePct)}<span class="stat-unit">%</span>` : "–"}
              </div>
              ${
                usedFormatted && totalFormatted
                  ? html`<div class="metric-sub">
                      ${usedFormatted.value}${usedFormatted.unit} / ${totalFormatted.value}${totalFormatted.unit}
                    </div>`
                  : nothing
              }
            </div>
          </div>
        </div>
        ${sparkline ? html`<div class="pool-header-sparkline">${sparkline}</div>` : nothing}
        ${
          showPoolDisks && resolved.poolParityDisks?.length
            ? html`<div class="pool-disk-group">
                <div class="temp-group-label">Parity</div>
                ${this._renderPoolDiskList(resolved.poolParityDisks, diskLayout, diskValueStyle, diskAttributes)}
              </div>`
            : nothing
        }
        ${
          showPoolDisks && resolved.poolMemberDisks?.length
            ? html`<div class="pool-disk-group">
                <div class="temp-group-label">Disks</div>
                ${this._renderPoolDiskList(resolved.poolMemberDisks, diskLayout, diskValueStyle, diskAttributes)}
              </div>`
            : nothing
        }
      </div>
    `;
  }

  /**
   * A pool's member/parity disks, laid out per three independent config
   * axes rather than one tiered style — `layout` (arrangement),
   * `valueStyle` (how each disk's value is represented), and `attributes`
   * (which descriptive fields show, if any). All three value styles show a
   * disk's *temperature* for now — ha-mos doesn't expose a per-disk usage
   * percentage yet (tracked: anym001/ha-mos#119); swapping
   * `_renderPoolDiskItem`'s `value` to read a usage entity/attribute once
   * that lands is the only change needed here.
   */
  private _renderPoolDiskList(
    disks: readonly PoolMemberDisk[],
    layout: "grid" | "rows",
    valueStyle: "gauge" | "bar" | "text",
    attributes: readonly PoolDiskAttribute[],
  ) {
    const items = disks.map((disk) => this._renderPoolDiskItem(disk, valueStyle, attributes));
    return layout === "grid"
      ? html`<div class="temp-grid">${items}</div>`
      : html`<div class="pool-disk-rows">${items}</div>`;
  }

  /** One disk, in whichever `valueStyle` was configured, with `attributes` appended (present in every style, though the gauge style nests them under the label instead of as a full-width line below — a reasonable difference in shape, not a bug, given the gauge style's info column already stacks label/value together). */
  private _renderPoolDiskItem(
    disk: PoolMemberDisk,
    valueStyle: "gauge" | "bar" | "text",
    attributes: readonly PoolDiskAttribute[],
  ) {
    const hass = this.hass;
    const { value, unit } = this._poolDiskValue(disk);
    const known = Number.isFinite(value);
    const valueText = known ? html`${formatSigFigs(value)}<span class="stat-unit">${unit}</span>` : "–";
    const icon = diskTypeIcon(stateOf(hass, disk.typeEntity));
    const attributesRow = this._renderPoolDiskAttributes(disk, attributes);

    if (valueStyle === "gauge") {
      return html`
        <div class="pool-disk-item pool-disk-item-gauge">
          <div class="gauge">
            <mos-detail-gauge .value=${value} icon=${icon}></mos-detail-gauge>
          </div>
          <div class="metric-info">
            <div class="metric-label">${disk.label}</div>
            <div class="metric-value">${valueText}</div>
            ${attributesRow}
          </div>
        </div>
      `;
    }

    if (valueStyle === "bar") {
      const pct = known ? Math.max(0, Math.min(100, value)) : 0;
      const color = known ? severityColor(pct) : "var(--disabled-color, #9e9e9e)";
      return html`
        <div class="pool-disk-item pool-disk-item-bar">
          <div class="temp-bar-row">
            <ha-icon class="temp-bar-icon" icon=${icon}></ha-icon>
            <span class="temp-bar-label">${disk.label}</span>
            <div class="temp-bar-track">
              <div class="temp-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <span class="temp-bar-value">${valueText}</span>
          </div>
          ${attributesRow}
        </div>
      `;
    }

    return html`
      <div class="pool-disk-item pool-disk-item-text">
        <div class="pool-disk-item-main">
          <ha-icon icon=${icon}></ha-icon>
          <span class="pool-disk-name">${disk.label}</span>
          <span class="pool-disk-text-value">${valueText}</span>
        </div>
        ${attributesRow}
      </div>
    `;
  }

  /**
   * A disk's primary value for the pool's gauge/bar/text styles — usage %
   * (ha-mos v0.3.3+, closes anym001/ha-mos#119) where available, falling
   * back to temperature on an older ha-mos that doesn't report it yet.
   */
  private _poolDiskValue(disk: PoolMemberDisk): { value: number; unit: string } {
    const hass = this.hass;
    if (disk.usageEntity) {
      return { value: Number(stateOf(hass, disk.usageEntity)), unit: "%" };
    }
    if (disk.temperatureEntity) {
      return { value: Number(stateOf(hass, disk.temperatureEntity)), unit: "°C" };
    }
    return { value: NaN, unit: "" };
  }

  /** The configured subset of a disk's model/type/size/power status/SMART warning/temperature, as `.attribute` chips — `undefined`/no-op fields are dropped, same as every other attributes row in this card. Temperature is offered here even though it used to be the primary value, so it doesn't disappear now that usage has taken that role. */
  private _renderPoolDiskAttributes(disk: PoolMemberDisk, attributes: readonly PoolDiskAttribute[]) {
    if (attributes.length === 0) {
      return nothing;
    }
    const hass = this.hass;
    const chips: unknown[] = [];
    if (attributes.includes("model")) {
      const model = stateOf(hass, disk.modelEntity);
      if (model) chips.push(html`<span class="attribute">${model}</span>`);
    }
    if (attributes.includes("type")) {
      const type = stateOf(hass, disk.typeEntity);
      if (type) chips.push(html`<span class="attribute">${type}</span>`);
    }
    if (attributes.includes("temperature")) {
      const temperature = stateOf(hass, disk.temperatureEntity);
      if (temperature) chips.push(html`<span class="attribute">${temperature}°C</span>`);
    }
    if (attributes.includes("size")) {
      const size = stateToBytes(disk.sizeEntity ? hass.states[disk.sizeEntity] : undefined);
      if (size !== undefined) {
        const formatted = formatBytes(size);
        chips.push(html`<span class="attribute">${formatted.value}${formatted.unit}</span>`);
      }
    }
    if (attributes.includes("power_status")) {
      const powerStatus = stateOf(hass, disk.powerStatusEntity);
      if (powerStatus) chips.push(html`<span class="attribute">${powerStatus}</span>`);
    }
    if (attributes.includes("smart_warning") && disk.smartWarningEntity && isOn(hass, disk.smartWarningEntity)) {
      chips.push(html`<span class="badge warning"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>SMART</span>`);
    }
    if (chips.length === 0) {
      return nothing;
    }
    return html`<div class="attributes">${chips}</div>`;
  }

  /**
   * Disk's stats: a usage gauge + labeled sparkline (ha-mos v0.3.3+ closed
   * anym001/ha-mos#119, adding a real per-disk `disk_usage`/space set — the
   * same generic `usageEntity`/`usedSpaceEntity`/`totalSpaceEntity`
   * resolution the pool kind already used, since `detail-kinds.ts`'s disk
   * entry now defines the same metrics), plus temperature/power status as
   * plain values, same layout as before that.
   */
  private _renderDiskStats(resolved: Resolved) {
    const hass = this.hass;
    const temperature = stateOf(hass, resolved.temperatureEntity);
    const temperatureUnit = resolved.temperatureEntity
      ? hass.states[resolved.temperatureEntity]?.attributes.unit_of_measurement
      : undefined;
    const powerStatus = stateOf(hass, resolved.powerStatusEntity);

    const usagePct = resolved.usageEntity ? Number(stateOf(hass, resolved.usageEntity)) : NaN;
    const usedBytes = stateToBytes(resolved.usedSpaceEntity ? hass.states[resolved.usedSpaceEntity] : undefined);
    const totalBytes = stateToBytes(resolved.totalSpaceEntity ? hass.states[resolved.totalSpaceEntity] : undefined);
    const usedFormatted = usedBytes !== undefined ? formatBytes(usedBytes) : undefined;
    const totalFormatted = totalBytes !== undefined ? formatBytes(totalBytes) : undefined;

    if (!resolved.usageEntity && !resolved.temperatureEntity && !resolved.powerStatusEntity) {
      return nothing;
    }

    return html`
      ${
        resolved.usageEntity
          ? html`<div class="metrics">
              ${this._metricRow({
                gauge: html`<mos-detail-gauge .value=${usagePct} icon="mdi:harddisk"></mos-detail-gauge>`,
                label: "Usage",
                value: Number.isFinite(usagePct)
                  ? html`${formatSigFigs(usagePct)}<span class="stat-unit">%</span>`
                  : "–",
                sub:
                  usedFormatted && totalFormatted
                    ? `${usedFormatted.value}${usedFormatted.unit} / ${totalFormatted.value}${totalFormatted.unit}`
                    : undefined,
                sparkline: this._sparklineFor(resolved.usageEntity, "var(--info-color, #039be5)"),
              })}
            </div>`
          : nothing
      }
      <div class="stats">
        ${
          resolved.temperatureEntity
            ? html`
                <div class="stat-item plain">
                  <ha-icon icon="mdi:thermometer"></ha-icon>
                  <div class="stat">
                    <span class="stat-label">Temperature</span>
                    <span class="stat-value"
                      >${temperature ?? "–"}${temperatureUnit ? html`<span class="stat-unit">${temperatureUnit}</span>` : nothing}</span
                    >
                  </div>
                </div>
              `
            : nothing
        }
        ${
          resolved.powerStatusEntity
            ? html`
                <div class="stat-item plain">
                  <ha-icon icon="mdi:power-plug-outline"></ha-icon>
                  <div class="stat">
                    <span class="stat-label">Power status</span>
                    <span class="stat-value">${powerStatus ?? "–"}</span>
                  </div>
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  /**
   * Every temperature reading available for the server: CPU (Main/Average/
   * Max), each disk's own temperature, and — when `show_hardware_sensors`
   * is on — any other hardware-sensor reading `ha-mos` reports (motherboard,
   * PSU, ...). `historyCapable` marks the single reading (CPU Main) allowed
   * to fetch a sparkline — see `_historyEntity`'s own comment for why that
   * stays bounded regardless of how many total readings a server has.
   *
   * The hardware-sensor group can duplicate CPU/disk readings — confirmed
   * against a live MOS `/sensors` response, which carries no field at all
   * linking a reading back to a specific disk or "this is the CPU" (just
   * `id`/`index`/`name`/`manufacturer`/`model`/`subtype`/`value`/`unit`, the
   * last two being null in practice). That's a MOS API limitation, not a
   * `ha-mos` gap, so it can't be deduped reliably here — `show_hardware_sensors`
   * (default `true`) is the escape hatch for a server where it's pure noise.
   */
  private _serverTemperatureReadings(resolved: Resolved): ServerTemperatureReading[] {
    const hass = this.hass;
    const readings: ServerTemperatureReading[] = [];
    if (resolved.cpuTempMainEntity) {
      readings.push({
        label: "CPU Main",
        entity: resolved.cpuTempMainEntity,
        icon: "mdi:chip",
        historyCapable: true,
        group: "cpu",
      });
    }
    if (resolved.cpuTempAverageEntity) {
      readings.push({
        label: "CPU Average",
        entity: resolved.cpuTempAverageEntity,
        icon: "mdi:chip",
        historyCapable: false,
        group: "cpu",
      });
    }
    if (resolved.cpuTempMaxEntity) {
      readings.push({
        label: "CPU Max",
        entity: resolved.cpuTempMaxEntity,
        icon: "mdi:chip",
        historyCapable: false,
        group: "cpu",
      });
    }
    for (const disk of resolved.diskTemperatures ?? []) {
      readings.push({
        label: disk.label,
        entity: disk.entity,
        icon: "mdi:harddisk",
        historyCapable: false,
        group: "disk",
      });
    }
    if (this._config.show_hardware_sensors ?? true) {
      for (const entityId of resolved.hardwareTemperatureEntities ?? []) {
        const label = (hass.states[entityId]?.attributes.friendly_name as string | undefined) ?? entityId;
        readings.push({ label, entity: entityId, icon: "mdi:thermometer", historyCapable: false, group: "system" });
      }
    }
    return readings;
  }

  /** Readings grouped CPU → System → Disk (empty groups omitted), each group's items sorted by label except CPU's own fixed Main/Average/Max order. */
  private _groupServerReadings(
    readings: readonly ServerTemperatureReading[],
  ): { group: ServerTemperatureGroup; label: string; items: ServerTemperatureReading[] }[] {
    return SERVER_TEMPERATURE_GROUP_ORDER.map((group) => {
      const items = readings.filter((reading) => reading.group === group);
      if (group !== "cpu") {
        items.sort((a, b) => a.label.localeCompare(b.label));
      }
      return { group, label: SERVER_TEMPERATURE_GROUP_LABELS[group], items };
    }).filter((entry) => entry.items.length > 0);
  }

  /**
   * Every temperature reading available for the server, in one of three
   * layouts (`cpu_temp_detail_style`). This is the reusable, embeddable
   * replacement for what used to be a hand-built `<ha-dialog>` inside
   * `mos-server-summary-card` — that card now just opens this kind via
   * `fire-dom-event`/popup-card (or this card is used standalone).
   */
  private _renderServerStats(resolved: Resolved) {
    const hass = this.hass;
    const readings = this._serverTemperatureReadings(resolved);
    if (readings.length === 0) {
      return nothing;
    }

    const style = this._config.cpu_temp_detail_style ?? "bars";
    const valueOf = (entity: string) => Number(stateOf(hass, entity));
    const valueText = (value: number) =>
      Number.isFinite(value) ? html`${formatSigFigs(value)}<span class="stat-unit">°C</span>` : "–";

    if (style === "grid") {
      return html`
        <div class="temp-grid-groups">
          ${this._groupServerReadings(readings).map(
            (group) => html`
              <div class="temp-group-label">${group.label}</div>
              <div class="temp-grid">
                ${group.items.map((reading) => {
                  const value = valueOf(reading.entity);
                  return html`
                    <div class="temp-grid-item">
                      <div class="gauge">
                        <mos-detail-gauge .value=${value} icon=${reading.icon}></mos-detail-gauge>
                      </div>
                      <div class="metric-info">
                        <div class="metric-label">${reading.label}</div>
                        <div class="metric-value">${valueText(value)}</div>
                      </div>
                    </div>
                  `;
                })}
              </div>
            `,
          )}
        </div>
      `;
    }

    if (style === "history") {
      // Only one reading (CPU Main) ever gets a sparkline — see
      // `_historyEntity`'s own comment for why history isn't fetched for
      // every reading regardless of how many a server has.
      const main = readings.find((reading) => reading.historyCapable);
      const others = readings.filter((reading) => reading !== main);
      return html`
        <div class="metrics">
          ${
            main
              ? this._metricRow({
                  gauge: html`<mos-detail-gauge .value=${valueOf(main.entity)} icon=${main.icon}></mos-detail-gauge>`,
                  label: main.label,
                  value: valueText(valueOf(main.entity)),
                  sparkline: this._sparklineFor(main.entity, "var(--red-color, #e53935)", {
                    top: "100°C",
                    bottom: "0°C",
                  }),
                })
              : nothing
          }
          ${this._groupServerReadings(others).map(
            (group) => html`
              <div class="temp-group-label">${group.label}</div>
              ${group.items.map(
                (reading) => html`
                  <div class="temp-plain-row">
                    <span class="metric-label">${reading.label}</span>
                    <span class="metric-value">${valueText(valueOf(reading.entity))}</span>
                  </div>
                `,
              )}
            `,
          )}
        </div>
      `;
    }

    return html`
      <div class="temp-bars">
        ${this._groupServerReadings(readings).map(
          (group) => html`
            <div class="temp-group-label">${group.label}</div>
            ${group.items.map((reading) => {
              const value = valueOf(reading.entity);
              const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
              const color = Number.isFinite(value) ? severityColor(pct) : "var(--disabled-color, #9e9e9e)";
              return html`
                <div class="temp-bar-row">
                  <ha-icon class="temp-bar-icon" icon=${reading.icon}></ha-icon>
                  <span class="temp-bar-label">${reading.label}</span>
                  <div class="temp-bar-track">
                    <div class="temp-bar-fill" style="width:${pct}%;background:${color}"></div>
                  </div>
                  <span class="temp-bar-value">${valueText(value)}</span>
                </div>
              `;
            })}
          `,
        )}
      </div>
    `;
  }

  /** Compose only: the stack's member containers and, when present, its deduplicated image list — read straight off the `state` entity's live attributes (`sensor/compose.py`'s `_state_attributes`), not a separate entity per container (ha-mos models no such entity — see detail-kinds.ts's header comment). */
  private _renderContainers(resolved: Resolved, kindDef: DetailKindDef) {
    if (kindDef.id !== "compose" || !resolved.stateEntity) {
      return nothing;
    }
    const stateObj = this.hass.states[resolved.stateEntity];
    const containers = stateObj?.attributes.containers as string[] | undefined;
    const images = stateObj?.attributes.images as string[] | undefined;
    if (!containers || containers.length === 0) {
      return nothing;
    }
    const style = this._config.containers_list_style ?? "list";

    return html`
      <div class="containers">
        <div class="containers-label">Containers</div>
        ${
          style === "chips"
            ? html`<div class="containers-chips">
                ${containers.map((name) => html`<span class="container-chip">${name}</span>`)}
              </div>`
            : html`<div class="containers-rows">
                ${containers.map((name) => html`<div class="container-row">${name}</div>`)}
              </div>`
        }
        ${images && images.length ? html`<div class="containers-images">Images: ${images.join(", ")}</div>` : nothing}
      </div>
    `;
  }

  /** No `"pool"` branch: its status badges render inside _renderPoolDetail's own header instead, via _poolStatusBadges — show_status is a no-op for pool, see _renderCard's comment. */
  private _renderStatus(resolved: Resolved, kindDef: DetailKindDef) {
    const hass = this.hass;
    const badges: StatusBadge[] = [];

    if (this._isGuest(kindDef)) {
      if (resolved.healthyEntity) {
        const healthy = isOn(hass, resolved.healthyEntity);
        badges.push({
          icon: healthy ? "mdi:check-circle-outline" : "mdi:alert-circle-outline",
          label: healthy ? "Healthy" : "Unhealthy",
          state: healthy ? "on" : "warning",
        });
      }
      if (resolved.updateAvailableEntity && isOn(hass, resolved.updateAvailableEntity)) {
        badges.push({ icon: "mdi:package-up", label: "Update available", state: "warning" });
      }
      if (resolved.autostartEntity) {
        const autostart = isOn(hass, resolved.autostartEntity);
        badges.push({
          icon: "mdi:power-settings",
          label: `Autostart ${autostart ? "on" : "off"}`,
          state: autostart ? "on" : "off",
        });
      }
    } else if (kindDef.id === "disk") {
      if (resolved.smartWarningEntity && isOn(hass, resolved.smartWarningEntity)) {
        badges.push({ icon: "mdi:alert-circle-outline", label: "SMART warning", state: "warning" });
      }
      if (resolved.preclearRunningEntity && isOn(hass, resolved.preclearRunningEntity)) {
        badges.push({ icon: "mdi:progress-clock", label: "Preclear running", state: "on" });
      }
    }

    if (badges.length === 0) {
      return nothing;
    }

    return html`
      <div class="status">
        ${badges.map(
          (badge) => html`
            <span class="badge ${badge.state}"><ha-icon icon=${badge.icon}></ha-icon>${badge.label}</span>
          `,
        )}
      </div>
    `;
  }

  private _renderPowerToggle(powerEntity: string) {
    const on = isOn(this.hass, powerEntity);
    return html`
      <div class="power-toggle" @click=${(e: Event) => this._togglePower(powerEntity, e)}>
        <ha-icon icon="mdi:power"></ha-icon>
        <span>Power</span>
        <div class="switch ${on ? "on" : "off"}"><div class="knob"></div></div>
      </div>
    `;
  }

  static styles = css`
    ha-card {
      box-sizing: border-box;
      padding: 12px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .empty {
      display: flex;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--secondary-text-color);
      padding: 8px;
    }
    .identity {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .icon-wrap {
      width: 40px;
      height: 40px;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .picture {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      object-fit: cover;
    }
    .fallback-icon {
      --mdc-icon-size: 32px;
      color: var(--secondary-text-color);
    }
    .identity-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .title {
      font-weight: 500;
      font-size: 15px;
    }
    .state-chip {
      font-size: 10px;
      text-transform: uppercase;
      padding: 1px 6px;
      border-radius: 8px;
      background: var(--disabled-color, #9e9e9e);
      color: white;
    }
    .state-chip.state-on,
    .state-chip.state-running {
      background: var(--green-color, #43a047);
    }
    .state-chip.state-off,
    .state-chip.state-stopped {
      background: var(--disabled-color, #9e9e9e);
    }
    .web-ui-link {
      display: flex;
      align-items: center;
      color: var(--secondary-text-color);
      --mdc-icon-size: 16px;
    }
    .attributes {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .attribute-label {
      opacity: 0.75;
    }
    .container-count-subtitle {
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .stats {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .stat-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .stat-item.plain ha-icon {
      color: var(--secondary-text-color);
    }
    .gauge {
      width: 40px;
      height: 40px;
      flex: 0 0 auto;
      --gauge-icon-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gauge ha-icon {
      color: var(--secondary-text-color);
      --mdc-icon-size: 20px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .stat-label {
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .stat-value {
      font-size: 14px;
      font-weight: 500;
    }
    .stat-unit {
      font-size: 10px;
      font-weight: 400;
      color: var(--secondary-text-color);
      margin-left: 1px;
    }
    .stat-sub {
      font-size: 10px;
      color: var(--secondary-text-color);
    }
    .metrics {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .metric-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .metric-info {
      flex: 0 0 auto;
      min-width: 70px;
    }
    .metric-label {
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .metric-value {
      font-size: 14px;
      font-weight: 500;
    }
    .metric-sub {
      font-size: 10px;
      color: var(--secondary-text-color);
    }
    .sparkline {
      flex: 1 1 auto;
      min-width: 0;
    }
    .temp-group-label {
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--secondary-text-color);
      margin-top: 6px;
    }
    .temp-group-label:first-child {
      margin-top: 0;
    }
    .temp-grid-groups {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .temp-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .temp-grid-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .temp-plain-row {
      display: flex;
      justify-content: space-between;
      padding-left: 50px;
    }
    .temp-bars {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .temp-bar-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .temp-bar-icon {
      flex: 0 0 auto;
      --mdc-icon-size: 14px;
      color: var(--secondary-text-color);
    }
    .temp-bar-label {
      flex: 0 0 auto;
      width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .temp-bar-track {
      flex: 1 1 auto;
      height: 8px;
      border-radius: 4px;
      background: var(--divider-color, rgba(127, 127, 127, 0.25));
      overflow: hidden;
    }
    .temp-bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .temp-bar-value {
      flex: 0 0 auto;
      width: 44px;
      text-align: right;
      font-size: 13px;
      font-weight: 500;
    }
    .pool-detail {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    /* Same row shape as kind-title-card's icon+title+trailing-gauge row
       (icon badge, a title column that actually grows to fill the middle,
       the gauge pinned to the far end) rather than cramming the gauge and
       all of the title/state text into one narrow column together. */
    .identity.pool-header {
      align-items: center;
    }
    .pool-header .identity-text {
      flex: 1 1 auto;
    }
    .pool-header-gauge {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pool-header-gauge-stat {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .pool-header-sparkline {
      height: 30px;
    }
    .pool-disk-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pool-disk-rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .pool-disk-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 12px;
    }
    .pool-disk-item-gauge {
      flex-direction: row;
      align-items: flex-start;
      gap: 10px;
    }
    .pool-disk-item-main {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pool-disk-item-main ha-icon {
      flex: 0 0 auto;
      --mdc-icon-size: 16px;
      color: var(--secondary-text-color);
    }
    .pool-disk-name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pool-disk-text-value {
      flex: 0 0 auto;
      color: var(--secondary-text-color);
    }
    .containers {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .containers-label {
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .containers-rows {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 12px;
    }
    .containers-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .container-chip {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
    }
    .containers-images {
      font-size: 10px;
      color: var(--secondary-text-color);
    }
    .status {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .badge {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
      --mdc-icon-size: 14px;
    }
    .badge.warning {
      color: var(--orange-color, #fb8c00);
    }
    .badge.on {
      color: var(--green-color, #43a047);
    }
    .power-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .power-toggle span {
      font-size: 13px;
      flex: 1 1 auto;
    }
    .switch {
      width: 34px;
      height: 18px;
      border-radius: 9px;
      background: var(--disabled-color, #9e9e9e);
      position: relative;
      transition: background 0.2s ease;
      flex: 0 0 auto;
    }
    .switch.on {
      background: var(--primary-color);
    }
    .knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: white;
      transition: left 0.2s ease;
    }
    .switch.on .knob {
      left: 18px;
    }
  `;
}

declare global {
  interface Window {
    customCards: unknown[];
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "mos-detail-card",
  name: "MOS Detail Card",
  description:
    "A single-device detail card for one ha-mos guest (Docker/Compose/LXC/VM), storage pool, or disk — identity, stats, history, status, and a power toggle where applicable.",
  preview: false,
});
