import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { handleAction } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import "./gauge";
import "./sparkline";
import { DEFAULT_SECTION_ORDER } from "./types";
import type { MosServerSummaryCardConfig, SectionId } from "./types";
import {
  entitiesByDevice,
  findMetricEntity,
  findProblemBinarySensors,
  findServerDevices,
  poolDisplayName,
  selectDiskDevices,
  selectGuestDevices,
  selectPoolDevices,
  subscribeDeviceRegistry,
  subscribeEntityRegistry,
} from "./devices";
import type { DeviceRegistryEntry, EntityRegistryEntry } from "./devices";
import {
  ARCH,
  BASE_OS,
  BOOT_TIME,
  COMPOSE_UPDATES_AVAILABLE,
  CPU_BRAND,
  CPU_LOAD,
  CPU_TEMPERATURE,
  DISK_SMART_WARNING,
  DOCKER_UPDATES_AVAILABLE,
  MEMORY_INSTALLED,
  MEMORY_USAGE,
  MOS_VERSION,
  NETBIRD_ONLINE,
  NFS_ENABLED,
  POOL_PROBLEM,
  POOL_USAGE,
  RECOMMENDED_KERNEL,
  RUNNING_KERNEL,
  SAMBA_ENABLED,
  SSH_ENABLED,
  TAILSCALE_ONLINE,
} from "./server-metrics";
import { fetchHistory, HistoryBuffer } from "./history";
import type { HistoryPoint } from "./history";
import { formatBytes, formatSigFigs, stateToBytes } from "./unit";
import { fillPlaceholders, GestureTracker, moreInfoEntity } from "./gesture";
import type { GestureAction } from "./gesture";

const CARD_VERSION = "0.1.0"; // x-release-please-version

console.info(
  `%c MOS-SERVER-SUMMARY-CARD %c v${CARD_VERSION} `,
  "color: white; background: #039be5; font-weight: 700;",
  "color: #039be5; background: white; font-weight: 700;",
);

interface PoolInfo {
  name: string;
  usageEntity?: string;
  problemEntity?: string;
}

interface ServiceItem {
  icon: string;
  label: string;
  state: "on" | "off" | "warning";
  tooltip: string;
}

interface InfoItem {
  icon: string;
  label: string;
  /** A plain string or a Lit template (e.g. a formatted byte value with a styled unit suffix). */
  value: unknown;
  /** MOS Version's update-available indicator. */
  badge?: boolean;
}

/** What discovery resolved for the current server. Recomputed only when the registries or config change, never on a bare `hass` tick. */
interface Resolved {
  serverFound: boolean;
  serverName: string;
  bootTimeEntity?: string;
  mosVersionEntity?: string;
  runningKernelEntity?: string;
  recommendedKernelEntity?: string;
  archEntity?: string;
  cpuBrandEntity?: string;
  baseOsEntity?: string;
  cpuLoadEntity?: string;
  cpuTemperatureEntity?: string;
  memoryUsageEntity?: string;
  memoryInstalledEntity?: string;
  dockerUpdatesEntity?: string;
  composeUpdatesEntity?: string;
  sshEnabledEntity?: string;
  sambaEnabledEntity?: string;
  nfsEnabledEntity?: string;
  tailscaleOnlineEntity?: string;
  netbirdOnlineEntity?: string;
  /** binary_sensor candidates across every guest device (any kind) — checked against `problem` device_class at render time. */
  guestProblemEntities: string[];
  pools: PoolInfo[];
  /** One `disk_smart_warning` entity per physical disk device. */
  diskSmartWarningEntities: string[];
}

/** A number to a whole-percent string, or "–" if unavailable. Distinct from formatSigFigs: this is for plain booleans/counts, not gauge labels. */
function sumStates(hass: HomeAssistant, entityIds: readonly (string | undefined)[]): number {
  let sum = 0;
  for (const entityId of entityIds) {
    const n = entityId ? Number(hass.states[entityId]?.state) : NaN;
    if (Number.isFinite(n)) {
      sum += n;
    }
  }
  return sum;
}

function anyOn(hass: HomeAssistant, entityIds: readonly string[]): boolean {
  return entityIds.some((entityId) => hass.states[entityId]?.state === "on");
}

/** A plain "N ago" string for a boot-time timestamp — no date library, this is the only relative-time need in the card. */
function relativeTime(date: Date): string {
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  const units: [number, string][] = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [secondsPerUnit, label] of units) {
    const count = Math.floor(seconds / secondsPerUnit);
    if (count >= 1) {
      return `${count} ${label}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

function elapsedParts(bootDate: Date): { days: number; hours: number; minutes: number } {
  const totalSeconds = Math.max(0, (Date.now() - bootDate.getTime()) / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
  };
}

/** "2d 4h 13m" — drops leading zero units, matching relativeTime's largest-unit-first convention but keeping all remaining ones. */
function formatUptimeCompact(bootDate: Date): string {
  const { days, hours, minutes } = elapsedParts(bootDate);
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return "just now";
}

/** "2 days, 4 hours, 13 minutes" — same elapsed time, full words, only non-zero units. */
function formatUptimeVerbose(bootDate: Date): string {
  const { days, hours, minutes } = elapsedParts(bootDate);
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} day${days === 1 ? "" : "s"}`);
  }
  if (hours > 0) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(", ") : "just now";
}

@customElement("mos-server-summary-card")
export class MosServerSummaryCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: MosServerSummaryCardConfig;
  @state() private _devices: DeviceRegistryEntry[] = [];
  @state() private _entities: EntityRegistryEntry[] = [];
  @state() private _registriesLoaded = false;

  private _unsubDevices?: UnsubscribeFunc;
  private _unsubEntities?: UnsubscribeFunc;
  private _resolved?: Resolved;

  private _cpuHistory?: HistoryBuffer;
  private _memoryHistory?: HistoryBuffer;
  private _historyKey?: string;
  private _lastCpuSample?: number;
  private _lastMemorySample?: number;

  /** One gesture tracker per pool (keyed by its display name), persisted across renders so a mid-gesture re-render doesn't reset an in-flight hold/double-tap timer. */
  private _poolGestures = new Map<string, GestureTracker>();
  private _cpuTempGesture = new GestureTracker();
  private _cardGesture = new GestureTracker();

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement("mos-server-summary-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): Partial<MosServerSummaryCardConfig> {
    return {};
  }

  public setConfig(config: MosServerSummaryCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = config;
  }

  // Deliberately no getLayoutOptions() with a fixed grid_rows: this card's
  // real height varies with which sections are enabled, their order, and
  // how many pools are discovered, and a static grid_rows that's
  // usually-but-not-always correct is exactly the bug mos-kind-title-card
  // had to fix (a lie the layout engine can't detect, so excess content
  // bleeds into whatever's below it instead of the engine reserving space
  // for it). Leaving it unset lets the platform fall back to its own
  // default sizing behavior.
  public getCardSize(): number {
    return 4;
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
    const serverId = this._config?.server;
    if (!serverId) {
      return undefined;
    }

    const servers = findServerDevices(this._devices);
    const serverDevice = servers.find((device) => device.id === serverId);
    const serverFound = serverDevice !== undefined;
    const byDevice = entitiesByDevice(this._entities);
    const serverEntities = byDevice.get(serverId) ?? [];

    const metric = (def: { translationKey: string; keySuffix: string }) =>
      findMetricEntity(serverEntities, def)?.entity_id;

    const guestDevices = serverFound ? selectGuestDevices(this._devices, serverId) : [];
    const guestProblemEntities = guestDevices.flatMap((device) =>
      findProblemBinarySensors(byDevice.get(device.id) ?? []).map((entity) => entity.entity_id),
    );

    const poolDevices = serverFound ? selectPoolDevices(this._devices, serverId) : [];
    const pools: PoolInfo[] = poolDevices.map((device) => {
      const poolEntities = byDevice.get(device.id) ?? [];
      return {
        name: poolDisplayName(device),
        usageEntity: findMetricEntity(poolEntities, POOL_USAGE)?.entity_id,
        problemEntity: findMetricEntity(poolEntities, POOL_PROBLEM)?.entity_id,
      };
    });

    const diskDevices = serverFound ? selectDiskDevices(this._devices, serverId) : [];
    const diskSmartWarningEntities = diskDevices
      .map((device) => findMetricEntity(byDevice.get(device.id) ?? [], DISK_SMART_WARNING)?.entity_id)
      .filter((entityId): entityId is string => entityId !== undefined);

    return {
      serverFound,
      serverName: serverDevice?.name_by_user || serverDevice?.name || serverId,
      bootTimeEntity: metric(BOOT_TIME),
      mosVersionEntity: metric(MOS_VERSION),
      runningKernelEntity: metric(RUNNING_KERNEL),
      recommendedKernelEntity: metric(RECOMMENDED_KERNEL),
      archEntity: metric(ARCH),
      cpuBrandEntity: metric(CPU_BRAND),
      baseOsEntity: metric(BASE_OS),
      cpuLoadEntity: metric(CPU_LOAD),
      cpuTemperatureEntity: metric(CPU_TEMPERATURE),
      memoryUsageEntity: metric(MEMORY_USAGE),
      memoryInstalledEntity: metric(MEMORY_INSTALLED),
      dockerUpdatesEntity: metric(DOCKER_UPDATES_AVAILABLE),
      composeUpdatesEntity: metric(COMPOSE_UPDATES_AVAILABLE),
      sshEnabledEntity: metric(SSH_ENABLED),
      sambaEnabledEntity: metric(SAMBA_ENABLED),
      nfsEnabledEntity: metric(NFS_ENABLED),
      tailscaleOnlineEntity: metric(TAILSCALE_ONLINE),
      netbirdOnlineEntity: metric(NETBIRD_ONLINE),
      guestProblemEntities,
      pools,
      diskSmartWarningEntities,
    };
  }

  /**
   * Fetches CPU-load/memory-usage history once per (entity, window) pair —
   * not on every render — then hands off to HistoryBuffer, which extends the
   * window locally from live ticks afterward (see history.ts). Fire-and-
   * forget: `requestUpdate()` on completion is what actually shows the
   * fetched trend line, since willUpdate can't await this render pass.
   */
  private _maybeFetchHistory(): void {
    const resolved = this._resolved;
    const hours = this._config?.history_hours ?? 3;
    const cpuEntity = resolved?.cpuLoadEntity;
    const memoryEntity = resolved?.memoryUsageEntity;
    const key = `${cpuEntity ?? ""}|${memoryEntity ?? ""}|${hours}`;
    if (key === this._historyKey || (!cpuEntity && !memoryEntity) || !this.hass?.connection) {
      return;
    }
    this._historyKey = key;

    const windowMs = hours * 60 * 60 * 1000;
    this._cpuHistory = cpuEntity ? new HistoryBuffer(windowMs) : undefined;
    this._memoryHistory = memoryEntity ? new HistoryBuffer(windowMs) : undefined;
    this._lastCpuSample = undefined;
    this._lastMemorySample = undefined;

    const entityIds = [cpuEntity, memoryEntity].filter((id): id is string => id !== undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connection = this.hass.connection as any;
    fetchHistory(connection, entityIds, hours)
      .then((points) => {
        if (cpuEntity && this._cpuHistory) {
          this._cpuHistory.seed(points[cpuEntity] ?? []);
        }
        if (memoryEntity && this._memoryHistory) {
          this._memoryHistory.seed(points[memoryEntity] ?? []);
        }
        this.requestUpdate();
      })
      .catch(() => {
        // History is a nice-to-have trend line, not load-bearing data — a
        // failed fetch (e.g. recorder disabled) just means no sparkline.
      });
  }

  /** Appends the current live state to a history buffer, once per actual sample (guarded by last_updated, not by render count). */
  private _sampleHistory(
    buffer: HistoryBuffer | undefined,
    entityId: string | undefined,
    lastSampleRef: "cpu" | "memory",
  ): readonly HistoryPoint[] | undefined {
    if (!buffer || !entityId) {
      return buffer?.get();
    }
    const stateObj = this.hass.states[entityId];
    const value = Number(stateObj?.state);
    const lastUpdated = stateObj?.last_updated ? new Date(stateObj.last_updated).getTime() : undefined;
    if (Number.isFinite(value) && lastUpdated !== undefined) {
      const lastSample = lastSampleRef === "cpu" ? this._lastCpuSample : this._lastMemorySample;
      if (lastUpdated !== lastSample) {
        buffer.push(value, lastUpdated);
        if (lastSampleRef === "cpu") {
          this._lastCpuSample = lastUpdated;
        } else {
          this._lastMemorySample = lastUpdated;
        }
      }
    }
    return buffer.get();
  }

  private _getPoolGesture(name: string): GestureTracker {
    let tracker = this._poolGestures.get(name);
    if (!tracker) {
      tracker = new GestureTracker();
      this._poolGestures.set(name, tracker);
    }
    return tracker;
  }

  private _poolActionConfig(action: GestureAction) {
    switch (action) {
      case "tap":
        return this._config.pool_tap_action;
      case "hold":
        return this._config.pool_hold_action;
      case "double_tap":
        return this._config.pool_double_tap_action;
    }
  }

  private _firePoolAction(pool: PoolInfo, action: GestureAction): void {
    const actionConfig = this._poolActionConfig(action);
    if (!actionConfig) {
      return;
    }
    const values = {
      pool_name: pool.name,
      pool_usage_entity: pool.usageEntity,
      pool_problem_entity: pool.problemEntity,
    };
    // handleAction reads a more-info entity off the config object it's
    // handed, never off the action config itself — moreInfoEntity lifts it
    // out (see gesture.ts). Without this, "more-info" with an [[entity]]
    // placeholder would silently do nothing.
    handleAction(
      this,
      this.hass,
      {
        entity: moreInfoEntity(actionConfig, values) ?? pool.usageEntity,
        [`${action}_action`]: fillPlaceholders(actionConfig, values),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      action,
    );
  }

  private _cpuTempActionConfig(action: GestureAction) {
    switch (action) {
      case "tap":
        return this._config.cpu_temp_tap_action;
      case "hold":
        return this._config.cpu_temp_hold_action;
      case "double_tap":
        return this._config.cpu_temp_double_tap_action;
    }
  }

  private _fireCpuTempAction(resolved: Resolved, action: GestureAction): void {
    const actionConfig = this._cpuTempActionConfig(action);
    if (!actionConfig) {
      return;
    }
    const values = {
      server_name: resolved.serverName,
      cpu_temp_entity: resolved.cpuTemperatureEntity,
    };
    handleAction(
      this,
      this.hass,
      {
        entity: moreInfoEntity(actionConfig, values) ?? resolved.cpuTemperatureEntity,
        [`${action}_action`]: fillPlaceholders(actionConfig, values),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      action,
    );
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }
    if (!this._config.server) {
      return this._shell(html`<ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>Select a server</span>`);
    }
    if (!this._registriesLoaded) {
      return this._shell(html`<span>Loading…</span>`);
    }
    const resolved = this._resolved;
    if (!resolved || !resolved.serverFound) {
      return this._shell(html`<ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>Server not found</span>`);
    }
    return this._renderCard(resolved);
  }

  private _shell(content: unknown) {
    return html`<ha-card><div class="empty">${content}</div></ha-card>`;
  }

  private _renderCard(resolved: Resolved) {
    const hass = this.hass;
    const title = this._config.title || resolved.serverName;

    const imageSize = this._config.image_size ?? 40;
    const showUptime = this._config.show_uptime ?? true;
    const uptimeStyle = this._config.uptime_style ?? "relative";
    const showInfo = this._config.show_info ?? true;
    const infoLayout = this._config.info_layout ?? "grid";
    const showCpuMetric = this._config.show_cpu_metric ?? true;
    const showMemoryMetric = this._config.show_memory_metric ?? true;
    const sparklineShowValueScale = this._config.sparkline_show_value_scale ?? false;
    const sparklineShowTimeScale = this._config.sparkline_show_time_scale ?? false;
    const showPools = this._config.show_pools ?? true;
    const showCpuTemp = this._config.show_cpu_temp ?? true;
    const showNetwork = this._config.show_network ?? true;
    const showServices = this._config.show_services ?? true;
    const servicesStyle = this._config.services_style ?? "compact";
    const showDiskHealth = this._config.show_disk_health ?? true;
    const showGuestStatus = this._config.show_guest_status ?? true;
    const guestStatusStyle = this._config.guest_status_style ?? "badges";
    const poolHasActions = !!(
      this._config.pool_tap_action ||
      this._config.pool_hold_action ||
      this._config.pool_double_tap_action
    );
    const cpuTempHasActions = !!(
      this._config.cpu_temp_tap_action ||
      this._config.cpu_temp_hold_action ||
      this._config.cpu_temp_double_tap_action
    );

    // --- Header ---
    const bootTimeState = resolved.bootTimeEntity ? hass.states[resolved.bootTimeEntity] : undefined;
    const bootDate = bootTimeState?.state ? new Date(bootTimeState.state) : undefined;
    const bootValid = bootDate && !Number.isNaN(bootDate.getTime());
    const uptimeText = bootValid
      ? uptimeStyle === "relative"
        ? `Boot time · ${relativeTime(bootDate)}`
        : `Uptime · ${uptimeStyle === "uptime_compact" ? formatUptimeCompact(bootDate) : formatUptimeVerbose(bootDate)}`
      : undefined;

    const dockerUpdatesCount = sumStates(hass, [resolved.dockerUpdatesEntity]);
    const composeUpdatesCount = sumStates(hass, [resolved.composeUpdatesEntity]);
    const guestUpdatesCount = dockerUpdatesCount + composeUpdatesCount;
    const guestProblemCount = resolved.guestProblemEntities.filter((entityId) => {
      const stateObj = hass.states[entityId];
      return stateObj?.attributes.device_class === "problem" && stateObj.state === "on";
    }).length;

    // --- Basic info grid ---
    const mosVersion = resolved.mosVersionEntity ? hass.states[resolved.mosVersionEntity]?.state : undefined;
    const runningKernel = resolved.runningKernelEntity ? hass.states[resolved.runningKernelEntity]?.state : undefined;
    const recommendedKernel = resolved.recommendedKernelEntity
      ? hass.states[resolved.recommendedKernelEntity]?.state
      : undefined;
    const mosUpdateAvailable =
      !!runningKernel && !!recommendedKernel && runningKernel !== "unknown" && runningKernel !== recommendedKernel;
    const arch = resolved.archEntity ? hass.states[resolved.archEntity]?.state : undefined;
    const cpuBrand = resolved.cpuBrandEntity ? hass.states[resolved.cpuBrandEntity]?.state : undefined;
    const baseOs = resolved.baseOsEntity ? hass.states[resolved.baseOsEntity]?.state : undefined;
    // memory_installed is device_class: data_size with a suggested display
    // unit (e.g. GiB) — its state string is already in that unit, not raw
    // bytes, so stateToBytes (which also reads unit_of_measurement) is
    // required here; a bare Number(state) previously produced "16.0B" from
    // a state of "16.0" GiB.
    const memoryInstalledBytes = resolved.memoryInstalledEntity
      ? stateToBytes(hass.states[resolved.memoryInstalledEntity])
      : undefined;
    const memoryInstalled = memoryInstalledBytes !== undefined ? formatBytes(memoryInstalledBytes) : undefined;

    // --- System metrics ---
    const cpuLoadPct = resolved.cpuLoadEntity ? Number(hass.states[resolved.cpuLoadEntity]?.state) : undefined;
    const cpuPoints = this._sampleHistory(this._cpuHistory, resolved.cpuLoadEntity, "cpu");
    const memoryUsagePct = resolved.memoryUsageEntity
      ? Number(hass.states[resolved.memoryUsageEntity]?.state)
      : undefined;
    const memoryPoints = this._sampleHistory(this._memoryHistory, resolved.memoryUsageEntity, "memory");
    const cpuTemperature = resolved.cpuTemperatureEntity
      ? Number(hass.states[resolved.cpuTemperatureEntity]?.state)
      : undefined;

    // --- Status strip inputs ---
    const tailscaleOn = resolved.tailscaleOnlineEntity
      ? hass.states[resolved.tailscaleOnlineEntity]?.state === "on"
      : false;
    const netbirdOn = resolved.netbirdOnlineEntity ? hass.states[resolved.netbirdOnlineEntity]?.state === "on" : false;
    const sshOn = resolved.sshEnabledEntity ? hass.states[resolved.sshEnabledEntity]?.state === "on" : false;
    const sambaOn = resolved.sambaEnabledEntity ? hass.states[resolved.sambaEnabledEntity]?.state === "on" : false;
    const nfsOn = resolved.nfsEnabledEntity ? hass.states[resolved.nfsEnabledEntity]?.state === "on" : false;
    const diskWarning = anyOn(hass, resolved.diskSmartWarningEntities);

    const memoryInstalledValue = memoryInstalled
      ? html`${memoryInstalled.value}<span class="unit">${memoryInstalled.unit}</span>`
      : "–";
    const infoItems: InfoItem[] = [
      { icon: "mdi:tag", label: "MOS Version", value: mosVersion ?? "–", badge: mosUpdateAvailable },
      { icon: "mdi:cpu-64-bit", label: "CPU", value: cpuBrand ?? "–" },
      { icon: "mdi:penguin", label: "Kernel", value: runningKernel ?? "–" },
      { icon: "mdi:chip", label: "Architecture", value: arch ?? "–" },
      { icon: "mdi:ghost", label: "Base OS", value: baseOs ?? "–" },
      { icon: "mdi:memory", label: "Memory Installed", value: memoryInstalledValue },
    ];
    const updateDot = html`<span class="info-update-dot"></span>`;

    const infoGrid = showInfo
      ? infoLayout === "grid"
        ? html`
            <div class="info-grid">
              ${infoItems.map(
                (item) => html`
                  <div class="info-item">
                    <div class="info-icon-wrap">
                      <ha-icon class="info-icon" icon=${item.icon}></ha-icon>
                      ${item.badge ? html`<span class="corner-badge"></span>` : nothing}
                    </div>
                    <div class="info-text">
                      <div class="info-label">${item.label}</div>
                      <div class="info-value">${item.value}</div>
                    </div>
                  </div>
                `,
              )}
            </div>
          `
        : infoLayout === "chips"
          ? html`
              <div class="info-chips">
                ${infoItems.map(
                  (item) => html`
                    <div class="info-chip">
                      <ha-icon icon=${item.icon}></ha-icon>
                      <span>${item.value}</span>
                      ${item.badge ? updateDot : nothing}
                    </div>
                  `,
                )}
              </div>
            `
          : infoLayout === "list"
            ? html`
                <div class="info-list">
                  ${infoItems.map(
                    (item) => html`
                      <div class="info-list-row">
                        <span class="info-list-label">${item.label}</span>
                        <span class="info-list-value">${item.value}${item.badge ? updateDot : nothing}</span>
                      </div>
                    `,
                  )}
                </div>
              `
            : html`
                <div class="info-line">
                  ${infoItems.map(
                    (item, index) =>
                      html`${index > 0 ? " · " : nothing}${item.value}${item.badge ? updateDot : nothing}`,
                  )}
                </div>
              `
      : nothing;

    const metricsSection =
      showCpuMetric || showMemoryMetric
        ? html`
            <div class="metrics">
              ${
                showCpuMetric
                  ? html`
                      <div class="metric-row">
                        <div class="gauge">
                          <mos-server-gauge .value=${cpuLoadPct} icon="mdi:chip"></mos-server-gauge>
                        </div>
                        <div class="metric-info">
                          <div class="metric-label">CPU Load</div>
                          <div class="metric-value">
                            ${
                              cpuLoadPct !== undefined && Number.isFinite(cpuLoadPct)
                                ? html`${formatSigFigs(cpuLoadPct)}<span class="unit">%</span>`
                                : "–"
                            }
                          </div>
                        </div>
                        <mos-sparkline
                          class="sparkline"
                          style="height: ${sparklineShowTimeScale ? "40px" : "30px"}"
                          .points=${cpuPoints ?? []}
                          .showValueScale=${sparklineShowValueScale}
                          .showTimeScale=${sparklineShowTimeScale}
                          color="var(--red-color, #e53935)"
                        ></mos-sparkline>
                      </div>
                    `
                  : nothing
              }
              ${
                showMemoryMetric
                  ? html`
                      <div class="metric-row">
                        <div class="gauge"><mos-server-gauge .value=${memoryUsagePct}></mos-server-gauge></div>
                        <div class="metric-info">
                          <div class="metric-label">Memory Usage</div>
                          <div class="metric-value">
                            ${
                              memoryUsagePct !== undefined && Number.isFinite(memoryUsagePct)
                                ? html`${formatSigFigs(memoryUsagePct)}<span class="unit">%</span>`
                                : "–"
                            }
                          </div>
                        </div>
                        <mos-sparkline
                          class="sparkline"
                          style="height: ${sparklineShowTimeScale ? "40px" : "30px"}"
                          .points=${memoryPoints ?? []}
                          .showValueScale=${sparklineShowValueScale}
                          .showTimeScale=${sparklineShowTimeScale}
                          color="var(--info-color, #039be5)"
                        ></mos-sparkline>
                      </div>
                    `
                  : nothing
              }
            </div>
          `
        : nothing;

    const cpuTempHandlers = this._cpuTempGesture.handlers((action) => this._fireCpuTempAction(resolved, action));

    const bottomRow =
      showPools || showCpuTemp
        ? html`
            <div class="bottom-row">
              ${
                showPools
                  ? resolved.pools.map((pool) => {
                      const usagePct = pool.usageEntity ? Number(hass.states[pool.usageEntity]?.state) : undefined;
                      const problem = pool.problemEntity ? hass.states[pool.problemEntity]?.state === "on" : false;
                      const label = this._config.pool_labels?.[pool.name] ?? `${pool.name} Pool Usage`;
                      const handlers = this._getPoolGesture(pool.name).handlers((action) =>
                        this._firePoolAction(pool, action),
                      );
                      return html`
                        <div
                          class="pill"
                          @pointerdown=${poolHasActions ? handlers.onPointerDown : undefined}
                          @pointerup=${poolHasActions ? handlers.onPointerUp : undefined}
                          @pointercancel=${poolHasActions ? handlers.onPointerCancel : undefined}
                        >
                          <div class="pill-gauge">
                            <mos-server-gauge .value=${problem ? 100 : usagePct} icon="mdi:database"></mos-server-gauge>
                          </div>
                          <div class="pill-text">
                            <div class="pill-value">
                              ${
                                usagePct !== undefined && Number.isFinite(usagePct)
                                  ? html`${formatSigFigs(usagePct)}<span class="unit">%</span>`
                                  : "–"
                              }
                            </div>
                            <div class="pill-label">${label}</div>
                          </div>
                        </div>
                      `;
                    })
                  : nothing
              }
              ${
                showCpuTemp
                  ? html`
                      <div
                        class="pill"
                        @pointerdown=${cpuTempHasActions ? cpuTempHandlers.onPointerDown : undefined}
                        @pointerup=${cpuTempHasActions ? cpuTempHandlers.onPointerUp : undefined}
                        @pointercancel=${cpuTempHasActions ? cpuTempHandlers.onPointerCancel : undefined}
                      >
                        <ha-icon class="pill-icon" icon="mdi:thermometer"></ha-icon>
                        <div class="pill-text">
                          <div class="pill-value">
                            ${
                              cpuTemperature !== undefined && Number.isFinite(cpuTemperature)
                                ? html`${formatSigFigs(cpuTemperature)}<span class="unit">°C</span>`
                                : "–"
                            }
                          </div>
                          <div class="pill-label">CPU Temp</div>
                        </div>
                      </div>
                    `
                  : nothing
              }
            </div>
          `
        : nothing;

    // --- Guest status section ---
    const guestMessages: string[] = [];
    if (dockerUpdatesCount > 0) {
      guestMessages.push(`${dockerUpdatesCount} Docker update${dockerUpdatesCount === 1 ? "" : "s"} pending`);
    }
    if (composeUpdatesCount > 0) {
      guestMessages.push(`${composeUpdatesCount} Compose update${composeUpdatesCount === 1 ? "" : "s"} pending`);
    }
    if (guestProblemCount > 0) {
      guestMessages.push(`${guestProblemCount} guest issue${guestProblemCount === 1 ? "" : "s"} reported`);
    }

    const guestStatusSection =
      showGuestStatus && (guestUpdatesCount > 0 || guestProblemCount > 0)
        ? html`
            <div class="guest-status">
              ${
                guestStatusStyle === "badges"
                  ? html`
                      ${
                        guestUpdatesCount > 0
                          ? html`
                              <div class="guest-badge update">
                                <ha-icon icon="mdi:update"></ha-icon>
                                <span>${guestUpdatesCount} update${guestUpdatesCount === 1 ? "" : "s"}</span>
                              </div>
                            `
                          : nothing
                      }
                      ${
                        guestProblemCount > 0
                          ? html`
                              <div class="guest-badge problem">
                                <ha-icon icon="mdi:alert-circle"></ha-icon>
                                <span>${guestProblemCount} issue${guestProblemCount === 1 ? "" : "s"}</span>
                              </div>
                            `
                          : nothing
                      }
                    `
                  : guestStatusStyle === "text"
                    ? html`<div class="guest-text">${guestMessages.join(" · ")}</div>`
                    : html`
                        <div class="guest-ticker">
                          <div class="guest-ticker-track">
                            <span>${guestMessages.join("   •   ")}</span>
                            <span>${guestMessages.join("   •   ")}</span>
                          </div>
                        </div>
                      `
              }
            </div>
          `
        : nothing;

    // --- Services section ---
    const serviceItems: ServiceItem[] = [];
    if (showNetwork && tailscaleOn) {
      serviceItems.push({ icon: "mdi:lan-connect", label: "Tailscale", state: "on", tooltip: "Tailscale online" });
    }
    if (showNetwork && netbirdOn) {
      serviceItems.push({ icon: "mdi:lan-connect", label: "Netbird", state: "on", tooltip: "Netbird online" });
    }
    if (showServices) {
      serviceItems.push({
        icon: "mdi:ssh",
        label: "SSH",
        state: sshOn ? "on" : "off",
        tooltip: `SSH ${sshOn ? "enabled" : "disabled"}`,
      });
      serviceItems.push({
        icon: "mdi:folder-network",
        label: "Samba",
        state: sambaOn ? "on" : "off",
        tooltip: `Samba ${sambaOn ? "enabled" : "disabled"}`,
      });
      serviceItems.push({
        icon: "mdi:folder-network-outline",
        label: "NFS",
        state: nfsOn ? "on" : "off",
        tooltip: `NFS ${nfsOn ? "enabled" : "disabled"}`,
      });
    }
    if (showDiskHealth && diskWarning) {
      serviceItems.push({ icon: "mdi:harddisk-alert", label: "Disk", state: "warning", tooltip: "Disk SMART warning" });
    }
    const stateWord = (state: ServiceItem["state"]) =>
      state === "warning" ? "Warning" : state === "on" ? "On" : "Off";

    const servicesSection =
      serviceItems.length > 0
        ? html`
            <div class="services services-${servicesStyle}">
              ${serviceItems.map((item) => {
                if (servicesStyle === "detailed") {
                  return html`
                    <div class="service-row ${item.state}">
                      <ha-icon icon=${item.icon}></ha-icon>
                      <span class="service-row-label">${item.label}</span>
                      <span class="service-row-state">${stateWord(item.state)}</span>
                    </div>
                  `;
                }
                if (servicesStyle === "labeled") {
                  return html`
                    <div class="service-chip ${item.state}" title=${item.tooltip}>
                      <ha-icon icon=${item.icon}></ha-icon>
                      <span>${item.label} ${stateWord(item.state)}</span>
                    </div>
                  `;
                }
                return html`<ha-icon
                  class="service-icon ${item.state}"
                  icon=${item.icon}
                  title=${item.tooltip}
                ></ha-icon>`;
              })}
            </div>
          `
        : nothing;

    // --- Assemble sections in the configured order (header excluded, always first) ---
    const sectionResults: Partial<Record<SectionId, unknown>> = {
      info: infoGrid,
      metrics: metricsSection,
      pools_temp: bottomRow,
      guest_status: guestStatusSection,
      services: servicesSection,
    };
    const configuredOrder = this._config.section_order;
    const order = configuredOrder && configuredOrder.length > 0 ? configuredOrder : DEFAULT_SECTION_ORDER;
    const seen = new Set<SectionId>();
    const orderedSections: unknown[] = [];
    for (const id of order) {
      if (!seen.has(id) && id in sectionResults) {
        seen.add(id);
        orderedSections.push(sectionResults[id]);
      }
    }
    // A stale/hand-edited order missing a newer section id still shows it, appended.
    for (const id of DEFAULT_SECTION_ORDER) {
      if (!seen.has(id)) {
        orderedSections.push(sectionResults[id]);
      }
    }

    const cardGestureHandlers = this._cardGesture.handlers((action) => {
      handleAction(this, this.hass, this._config, action);
    });

    return html`
      <ha-card
        @pointerdown=${cardGestureHandlers.onPointerDown}
        @pointerup=${cardGestureHandlers.onPointerUp}
        @pointercancel=${cardGestureHandlers.onPointerCancel}
      >
        <div class="header">
          <div class="image-wrap" style="width:${imageSize}px;height:${imageSize}px">
            ${
              this._config.image
                ? html`<img class="header-image" src=${this._config.image} alt="" />`
                : html`<ha-icon
                    class="header-image-fallback"
                    icon="mdi:server"
                    style="--mdc-icon-size:${imageSize}px"
                  ></ha-icon>`
            }
          </div>
          <div class="title-col">
            <div class="title">${title}</div>
          </div>
          ${showUptime && uptimeText ? html`<div class="uptime">${uptimeText}</div>` : nothing}
        </div>
        ${orderedSections}
      </ha-card>
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
      align-items: center;
      gap: 8px;
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .image-wrap {
      position: relative;
      flex: 0 0 auto;
    }
    .header-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .header-image-fallback {
      width: 100%;
      height: 100%;
      color: var(--secondary-text-color);
    }
    .info-icon-wrap {
      position: relative;
      flex: 0 0 auto;
    }
    .info-icon-wrap .corner-badge {
      position: absolute;
      top: -1px;
      right: -1px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--info-color, #039be5);
      box-shadow: 0 0 0 2px var(--card-background-color, #1c1c1c);
    }
    .title-col {
      flex: 1 1 auto;
      min-width: 0;
    }
    .title {
      font-size: 16px;
      font-weight: 500;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .uptime {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
    }
    .info-item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .info-icon {
      flex: 0 0 auto;
      --mdc-icon-size: 18px;
      color: var(--secondary-text-color);
    }
    .info-text {
      min-width: 0;
    }
    .info-label {
      font-size: 8.5px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--secondary-text-color);
    }
    .info-value {
      font-size: 12px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .info-update-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--info-color, #039be5);
      margin-left: 3px;
      vertical-align: middle;
    }
    .info-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .info-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.1));
    }
    .info-chip ha-icon {
      --mdc-icon-size: 14px;
      color: var(--secondary-text-color);
    }
    .info-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .info-list-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
    }
    .info-list-label {
      color: var(--secondary-text-color);
    }
    .info-list-value {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .info-line {
      font-size: 12px;
      font-weight: 500;
      overflow-wrap: break-word;
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
    .metric-row .gauge {
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      --gauge-icon-size: 14px;
    }
    .metric-info {
      flex: 0 0 auto;
      width: 70px;
    }
    .metric-label {
      font-size: 8.5px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--secondary-text-color);
    }
    .metric-value {
      font-size: 15px;
      font-weight: 600;
    }
    .metric-value .unit,
    .info-value .unit,
    .pill-value .unit {
      font-size: 0.7em;
      font-weight: 400;
      margin-left: 1px;
      color: var(--secondary-text-color);
    }
    .sparkline {
      flex: 1 1 auto;
      min-width: 0;
    }
    .bottom-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .pill {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.1));
      border-radius: 999px;
      padding: 4px 10px 4px 4px;
    }
    .pill-gauge {
      width: 26px;
      height: 26px;
      flex: 0 0 auto;
      --gauge-icon-size: 12px;
    }
    .pill-icon {
      --mdc-icon-size: 18px;
      color: var(--secondary-text-color);
      margin: 0 2px;
    }
    .pill-value {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.1;
    }
    .pill-label {
      font-size: 8.5px;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    .guest-status {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .guest-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.1));
    }
    .guest-badge ha-icon {
      --mdc-icon-size: 14px;
    }
    .guest-badge.update {
      color: var(--info-color, #039be5);
    }
    .guest-badge.problem {
      color: var(--error-color, #db4437);
    }
    .guest-text {
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .guest-ticker {
      overflow: hidden;
      white-space: nowrap;
      width: 100%;
    }
    .guest-ticker-track {
      display: inline-flex;
      animation: guest-ticker-scroll 15s linear infinite;
    }
    .guest-ticker-track span {
      padding-right: 40px;
      font-size: 11px;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }
    @keyframes guest-ticker-scroll {
      from {
        transform: translateX(0);
      }
      to {
        transform: translateX(-50%);
      }
    }
    .services {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .services-detailed {
      flex-direction: column;
      gap: 4px;
    }
    .service-icon {
      --mdc-icon-size: 16px;
    }
    .service-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.1));
    }
    .service-chip ha-icon {
      --mdc-icon-size: 14px;
    }
    .service-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .service-row ha-icon {
      --mdc-icon-size: 16px;
      flex: 0 0 auto;
    }
    .service-row-label {
      flex: 1 1 auto;
    }
    .service-row-state {
      font-size: 10px;
      color: var(--secondary-text-color);
    }
    .services .on {
      color: var(--green-color, #43a047);
    }
    .services .off {
      color: var(--disabled-color, #9e9e9e);
      opacity: 0.6;
    }
    .services .warning {
      color: var(--red-color, #e53935);
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
  type: "mos-server-summary-card",
  name: "MOS Server Summary Card",
  description:
    "A compact Home Assistant Lovelace summary card for one ha-mos server: identity/version info, live CPU/memory gauges with history, storage pool usage, and CPU temperature.",
  preview: false,
});
