import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { handleAction } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import "./gauge";
import "./sparkline";
import type { MosServerSummaryCardConfig } from "./types";
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
import { formatBytes, formatSigFigs } from "./unit";

const CARD_VERSION = "0.1.0";

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
  // real height varies with which sections are enabled and how many pools
  // are discovered, and a static grid_rows that's usually-but-not-always
  // correct is exactly the bug mos-kind-title-card had to fix (a lie the
  // layout engine can't detect, so excess content bleeds into whatever's
  // below it instead of the engine reserving space for it). Leaving it
  // unset lets the platform fall back to its own default sizing behavior.
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

    const showUptime = this._config.show_uptime ?? true;
    const showInfo = this._config.show_info ?? true;
    const showCpuMetric = this._config.show_cpu_metric ?? true;
    const showMemoryMetric = this._config.show_memory_metric ?? true;
    const showPools = this._config.show_pools ?? true;
    const showCpuTemp = this._config.show_cpu_temp ?? true;
    const showNetwork = this._config.show_network ?? true;
    const showServices = this._config.show_services ?? true;
    const showDiskHealth = this._config.show_disk_health ?? true;
    const showGuestStatus = this._config.show_guest_status ?? true;

    // --- Header ---
    const bootTimeState = resolved.bootTimeEntity ? hass.states[resolved.bootTimeEntity] : undefined;
    const bootDate = bootTimeState?.state ? new Date(bootTimeState.state) : undefined;
    const uptimeText =
      bootDate && !Number.isNaN(bootDate.getTime()) ? `Boot time · ${relativeTime(bootDate)}` : undefined;

    const guestUpdatesCount = sumStates(hass, [resolved.dockerUpdatesEntity, resolved.composeUpdatesEntity]);
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
    const memoryInstalledBytes = resolved.memoryInstalledEntity
      ? Number(hass.states[resolved.memoryInstalledEntity]?.state)
      : undefined;
    const memoryInstalled =
      memoryInstalledBytes !== undefined && Number.isFinite(memoryInstalledBytes)
        ? formatBytes(memoryInstalledBytes)
        : undefined;

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

    // --- Status strip ---
    const tailscaleOn = resolved.tailscaleOnlineEntity
      ? hass.states[resolved.tailscaleOnlineEntity]?.state === "on"
      : false;
    const netbirdOn = resolved.netbirdOnlineEntity ? hass.states[resolved.netbirdOnlineEntity]?.state === "on" : false;
    const sshOn = resolved.sshEnabledEntity ? hass.states[resolved.sshEnabledEntity]?.state === "on" : false;
    const sambaOn = resolved.sambaEnabledEntity ? hass.states[resolved.sambaEnabledEntity]?.state === "on" : false;
    const nfsOn = resolved.nfsEnabledEntity ? hass.states[resolved.nfsEnabledEntity]?.state === "on" : false;
    const diskWarning = anyOn(hass, resolved.diskSmartWarningEntities);

    const infoGrid = showInfo
      ? html`
          <div class="info-grid">
            <div class="info-item">
              <div class="info-icon-wrap">
                <ha-icon class="info-icon" icon="mdi:tag"></ha-icon>
                ${mosUpdateAvailable ? html`<span class="corner-badge update"></span>` : nothing}
              </div>
              <div class="info-text">
                <div class="info-label">MOS Version</div>
                <div class="info-value">${mosVersion ?? "–"}</div>
              </div>
            </div>
            <div class="info-item">
              <ha-icon class="info-icon" icon="mdi:cpu-64-bit"></ha-icon>
              <div class="info-text">
                <div class="info-label">CPU</div>
                <div class="info-value">${cpuBrand ?? "–"}</div>
              </div>
            </div>
            <div class="info-item">
              <ha-icon class="info-icon" icon="mdi:penguin"></ha-icon>
              <div class="info-text">
                <div class="info-label">Kernel</div>
                <div class="info-value">${runningKernel ?? "–"}</div>
              </div>
            </div>
            <div class="info-item">
              <ha-icon class="info-icon" icon="mdi:chip"></ha-icon>
              <div class="info-text">
                <div class="info-label">Architecture</div>
                <div class="info-value">${arch ?? "–"}</div>
              </div>
            </div>
            <div class="info-item">
              <ha-icon class="info-icon" icon="mdi:ghost"></ha-icon>
              <div class="info-text">
                <div class="info-label">Base OS</div>
                <div class="info-value">${baseOs ?? "–"}</div>
              </div>
            </div>
            <div class="info-item">
              <ha-icon class="info-icon" icon="mdi:memory"></ha-icon>
              <div class="info-text">
                <div class="info-label">Memory Installed</div>
                <div class="info-value">
                  ${memoryInstalled ? html`${memoryInstalled.value}<span class="unit">${memoryInstalled.unit}</span>` : "–"}
                </div>
              </div>
            </div>
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
                          .points=${cpuPoints ?? []}
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
                          .points=${memoryPoints ?? []}
                          color="var(--info-color, #039be5)"
                        ></mos-sparkline>
                      </div>
                    `
                  : nothing
              }
            </div>
          `
        : nothing;

    const bottomRow =
      showPools || showCpuTemp
        ? html`
            <div class="bottom-row">
              ${
                showPools
                  ? resolved.pools.map((pool) => {
                      const usagePct = pool.usageEntity ? Number(hass.states[pool.usageEntity]?.state) : undefined;
                      const problem = pool.problemEntity ? hass.states[pool.problemEntity]?.state === "on" : false;
                      return html`
                        <div class="pill">
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
                            <div class="pill-label">${pool.name} Pool Usage</div>
                          </div>
                        </div>
                      `;
                    })
                  : nothing
              }
              ${
                showCpuTemp
                  ? html`
                      <div class="pill">
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

    const statusBadges: unknown[] = [];
    if (showNetwork && tailscaleOn) {
      statusBadges.push(
        html`<ha-icon class="status-badge on" icon="mdi:lan-connect" title="Tailscale online"></ha-icon>`,
      );
    }
    if (showNetwork && netbirdOn) {
      statusBadges.push(
        html`<ha-icon class="status-badge on" icon="mdi:lan-connect" title="Netbird online"></ha-icon>`,
      );
    }
    if (showServices) {
      statusBadges.push(
        html`<ha-icon
          class="status-badge ${sshOn ? "on" : "off"}"
          icon="mdi:ssh"
          title="SSH ${sshOn ? "enabled" : "disabled"}"
        ></ha-icon>`,
        html`<ha-icon
          class="status-badge ${sambaOn ? "on" : "off"}"
          icon="mdi:folder-network"
          title="Samba ${sambaOn ? "enabled" : "disabled"}"
        ></ha-icon>`,
        html`<ha-icon
          class="status-badge ${nfsOn ? "on" : "off"}"
          icon="mdi:folder-network-outline"
          title="NFS ${nfsOn ? "enabled" : "disabled"}"
        ></ha-icon>`,
      );
    }
    if (showDiskHealth && diskWarning) {
      statusBadges.push(
        html`<ha-icon class="status-badge warning" icon="mdi:harddisk-alert" title="Disk SMART warning"></ha-icon>`,
      );
    }
    const statusStrip = statusBadges.length > 0 ? html`<div class="status-strip">${statusBadges}</div>` : nothing;

    return html`
      <ha-card
        @pointerdown=${this._onPointerDown}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerCancel}
      >
        <div class="header">
          <div class="image-wrap">
            ${
              this._config.image
                ? html`<img class="header-image" src=${this._config.image} alt="" />`
                : html`<ha-icon class="header-image-fallback" icon="mdi:server"></ha-icon>`
            }
            ${
              showGuestStatus && guestProblemCount > 0
                ? html`<ha-icon class="corner-badge problem" icon="mdi:alert-circle"></ha-icon>`
                : nothing
            }
            ${
              showGuestStatus && guestUpdatesCount > 0
                ? html`<ha-icon class="corner-badge update" icon="mdi:update"></ha-icon>`
                : nothing
            }
          </div>
          <div class="title-col">
            <div class="title">${title}</div>
          </div>
          ${showUptime && uptimeText ? html`<div class="uptime">${uptimeText}</div>` : nothing}
        </div>
        ${infoGrid} ${metricsSection} ${bottomRow} ${statusStrip}
      </ha-card>
    `;
  }

  private _holdTimer?: ReturnType<typeof setTimeout>;
  private _holdFired = false;
  private _clickTimer?: ReturnType<typeof setTimeout>;
  private _clickCount = 0;

  private _onPointerDown = (): void => {
    this._holdFired = false;
    this._holdTimer = setTimeout(() => {
      this._holdFired = true;
      this._fireAction("hold");
    }, 500);
  };

  private _onPointerUp = (): void => {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = undefined;
    }
    if (this._holdFired) {
      return;
    }
    this._clickCount += 1;
    if (this._clickCount === 1) {
      this._clickTimer = setTimeout(() => {
        this._clickCount = 0;
        this._fireAction("tap");
      }, 250);
    } else {
      clearTimeout(this._clickTimer);
      this._clickCount = 0;
      this._fireAction("double_tap");
    }
  };

  private _onPointerCancel = (): void => {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = undefined;
    }
  };

  private _fireAction(action: "tap" | "hold" | "double_tap"): void {
    if (!this._config) {
      return;
    }
    handleAction(this, this.hass, this._config, action);
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
      width: 40px;
      height: 40px;
    }
    .header-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .header-image-fallback {
      width: 100%;
      height: 100%;
      --mdc-icon-size: 40px;
      color: var(--secondary-text-color);
    }
    .corner-badge {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-size: 10px;
      color: #fff;
      box-shadow: 0 0 0 2px var(--card-background-color, #1c1c1c);
    }
    .corner-badge.problem {
      top: -2px;
      right: -2px;
      background: var(--error-color, #db4437);
    }
    .corner-badge.update {
      bottom: -2px;
      right: -2px;
      background: var(--info-color, #039be5);
    }
    .info-icon-wrap .corner-badge.update {
      top: -1px;
      right: -1px;
      bottom: auto;
      width: 8px;
      height: 8px;
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
    .info-icon-wrap {
      position: relative;
      flex: 0 0 auto;
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
      height: 30px;
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
    .status-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .status-badge {
      --mdc-icon-size: 16px;
    }
    .status-badge.on {
      color: var(--green-color, #43a047);
    }
    .status-badge.off {
      color: var(--disabled-color, #9e9e9e);
      opacity: 0.6;
    }
    .status-badge.warning {
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
