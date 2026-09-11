import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { handleAction } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import "./gauge";
import type { MosKindTitleCardConfig } from "./types";
import { KIND_DEFS } from "./kinds";
import type { KindDef, SummarySensorId } from "./kinds";
import {
  SERVER_MEMORY_TOTAL,
  entitiesByDevice,
  findMetricEntity,
  findProblemBinarySensors,
  findServerDevices,
  selectGuestDevices,
  subscribeDeviceRegistry,
  subscribeEntityRegistry,
} from "./devices";
import type { DeviceRegistryEntry, EntityRegistryEntry } from "./devices";
import { formatBytes, stateToBytes } from "./unit";

const CARD_VERSION = "1.5.0";

/** A HA named color token ("blue", "primary", ...) becomes its theme CSS var; anything else (a hex/rgb literal) passes through untouched. */
function resolveColor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return /^[a-z-]+$/i.test(value) ? `var(--${value}-color)` : value;
}

/** Sums the plain numeric state of each entity (no unit conversion — used for percentages/counts, not data sizes). */
function sumStates(hass: HomeAssistant, entityIds: readonly string[]): number | undefined {
  let sum = 0;
  let any = false;
  for (const entityId of entityIds) {
    const n = Number(hass.states[entityId]?.state);
    if (Number.isFinite(n)) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : undefined;
}

// eslint-disable-next-line no-console
console.info(
  `%c MOS-KIND-TITLE-CARD %c v${CARD_VERSION} `,
  "color: white; background: #039be5; font-weight: 700;",
  "color: #039be5; background: white; font-weight: 700;",
);

/** What discovery resolved for the current server + kind. Recomputed only when the registries or config change, never on a bare `hass` tick. */
interface Resolved {
  serverFound: boolean;
  /** The server device's own web UI base URL, for linking to its per-kind pages. */
  serverConfigurationUrl?: string;
  memoryTotalEntity?: string;
  guestCount: number;
  summaryEntities: Partial<Record<SummarySensorId, string>>;
  memoryEntities: string[];
  cpuEntities: string[];
  problemEntities: string[];
  /** Per-stack containers running/total (compose only). */
  containerRunningEntities: string[];
  containerTotalEntities: string[];
}

@customElement("mos-kind-title-card")
export class MosKindTitleCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: MosKindTitleCardConfig;
  @state() private _devices: DeviceRegistryEntry[] = [];
  @state() private _entities: EntityRegistryEntry[] = [];
  @state() private _registriesLoaded = false;

  private _unsubDevices?: UnsubscribeFunc;
  private _unsubEntities?: UnsubscribeFunc;
  private _resolved?: Resolved;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor");
    return document.createElement("mos-kind-title-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): Partial<MosKindTitleCardConfig> {
    return {};
  }

  public setConfig(config: MosKindTitleCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = config;
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
  }

  private _resolve(): Resolved | undefined {
    const kind = this._config?.kind ? KIND_DEFS[this._config.kind] : undefined;
    const serverId = this._config?.server;
    if (!kind || !serverId) {
      return undefined;
    }

    const serverDevices = findServerDevices(this._devices);
    const serverDevice = serverDevices.find((device) => device.id === serverId);
    const serverFound = serverDevice !== undefined;
    const byDevice = entitiesByDevice(this._entities);

    const serverEntities = byDevice.get(serverId) ?? [];
    const memoryTotalEntity = findMetricEntity(serverEntities, SERVER_MEMORY_TOTAL)?.entity_id;

    const summaryEntities: Partial<Record<SummarySensorId, string>> = {};
    for (const sensor of kind.summarySensors) {
      const found = findMetricEntity(serverEntities, sensor);
      if (found) {
        summaryEntities[sensor.id] = found.entity_id;
      }
    }

    const guests = serverFound ? selectGuestDevices(this._devices, kind, serverId) : [];
    const memoryEntities: string[] = [];
    const cpuEntities: string[] = [];
    const problemEntities: string[] = [];
    const containerRunningEntities: string[] = [];
    const containerTotalEntities: string[] = [];
    for (const guest of guests) {
      const guestEntities = byDevice.get(guest.id) ?? [];

      const memory = findMetricEntity(guestEntities, kind.memoryMetric);
      if (memory) {
        memoryEntities.push(memory.entity_id);
      }

      const cpu = findMetricEntity(guestEntities, kind.cpuMetric);
      if (cpu) {
        cpuEntities.push(cpu.entity_id);
      }

      if (kind.containerRatioMetrics) {
        const runningEntity = findMetricEntity(guestEntities, kind.containerRatioMetrics.running);
        if (runningEntity) {
          containerRunningEntities.push(runningEntity.entity_id);
        }
        const totalEntity = findMetricEntity(guestEntities, kind.containerRatioMetrics.total);
        if (totalEntity) {
          containerTotalEntities.push(totalEntity.entity_id);
        }
      }

      for (const candidate of findProblemBinarySensors(guestEntities)) {
        problemEntities.push(candidate.entity_id);
      }
    }

    return {
      serverFound,
      serverConfigurationUrl: serverDevice?.configuration_url ?? undefined,
      memoryTotalEntity,
      guestCount: guests.length,
      summaryEntities,
      memoryEntities,
      cpuEntities,
      problemEntities,
      containerRunningEntities,
      containerTotalEntities,
    };
  }

  public getCardSize(): number {
    return 1;
  }

  public getLayoutOptions(): Record<string, unknown> {
    return { grid_columns: 4, grid_rows: 1, grid_min_rows: 1, grid_max_rows: 1 };
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }

    const kind = this._config.kind ? KIND_DEFS[this._config.kind] : undefined;

    if (!this._config.server || !kind) {
      return this._shell(html`<ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>Select a server and kind</span>`);
    }

    if (!this._registriesLoaded) {
      return this._shell(html`<span>Loading…</span>`);
    }

    const resolved = this._resolved;
    if (!resolved || !resolved.serverFound) {
      return this._shell(html`<ha-icon icon="mdi:alert-circle-outline"></ha-icon><span>Server not found</span>`);
    }

    return this._renderCard(kind, resolved);
  }

  private _shell(content: unknown) {
    return html`<ha-card><div class="empty">${content}</div></ha-card>`;
  }

  private _renderCard(kind: KindDef, resolved: Resolved) {
    const title = this._config.title || kind.name;
    const icon = this._config.icon || kind.icon;
    const hass = this.hass;
    const layout = this._config.layout ?? "standard";
    const showBadges = this._config.show_badges ?? true;
    const showCounts = this._config.show_counts ?? true;
    const showGauge = this._config.show_gauge ?? true;
    const showCpu = this._config.show_cpu ?? false;
    const showLink = this._config.show_link ?? true;
    const showContainers = (this._config.show_containers ?? false) && !!kind.containerRatioMetrics;
    const accentColor = resolveColor(this._config.color) ?? "var(--primary-color)";

    const updatesEntityId = resolved.summaryEntities.updates;
    const updatesCount = updatesEntityId ? Number(hass.states[updatesEntityId]?.state) : undefined;
    // Only shown once there's actually an update — "0 updates" is noise, not information.
    const hasUpdates = typeof updatesCount === "number" && Number.isFinite(updatesCount) && updatesCount > 0;

    const problemCount = resolved.problemEntities.filter((entityId) => {
      const stateObj = hass.states[entityId];
      return stateObj?.attributes.device_class === "problem" && stateObj.state === "on";
    }).length;
    const hasProblem = problemCount > 0;

    // Beneath the title, ha-mos-card-style: a short line of secondary info.
    // Problem outranks an update — it's the more urgent thing to surface.
    const subtitleText = hasProblem
      ? `${problemCount} issue${problemCount === 1 ? "" : "s"}`
      : hasUpdates
        ? `${updatesCount} update${updatesCount === 1 ? "" : "s"} available`
        : "";

    const runningEntityId = resolved.summaryEntities.running;
    const totalEntityId = resolved.summaryEntities.total;
    const runningState = runningEntityId ? hass.states[runningEntityId]?.state : undefined;
    const totalState = totalEntityId ? hass.states[totalEntityId]?.state : undefined;
    const hasCountRow = runningState !== undefined || totalState !== undefined;

    const hasGuests = resolved.guestCount > 0;
    let memoryBytes: number | undefined;
    if (hasGuests) {
      let sum = 0;
      let any = false;
      for (const entityId of resolved.memoryEntities) {
        const bytes = stateToBytes(hass.states[entityId]);
        if (bytes !== undefined) {
          sum += bytes;
          any = true;
        }
      }
      memoryBytes = any ? sum : undefined;
    }
    const totalBytes = resolved.memoryTotalEntity ? stateToBytes(hass.states[resolved.memoryTotalEntity]) : undefined;
    const gaugePct =
      memoryBytes !== undefined && totalBytes !== undefined && totalBytes > 0
        ? Math.min(100, (memoryBytes / totalBytes) * 100)
        : undefined;

    const cpuPct = showCpu && hasGuests ? sumStates(hass, resolved.cpuEntities) : undefined;

    const linkUrl =
      showLink && resolved.serverConfigurationUrl
        ? `${resolved.serverConfigurationUrl.replace(/\/+$/, "")}/${(this._config.link_path || kind.uiPath).replace(/^\/+/, "")}`
        : undefined;

    const containersRunning = showContainers ? sumStates(hass, resolved.containerRunningEntities) : undefined;
    const containersTotal = showContainers ? sumStates(hass, resolved.containerTotalEntities) : undefined;
    const hasContainerRow = containersRunning !== undefined || containersTotal !== undefined;

    const countsBlock = showCounts
      ? html`
          <div class="counts">
            <div class="stat">
              <div class="stat-value ${!hasCountRow ? "muted" : ""}">
                ${hasCountRow ? html`${runningState ?? "–"}${totalState !== undefined ? html`/${totalState}` : nothing}` : "–"}
              </div>
              <div class="stat-label">Running</div>
            </div>
            ${hasUpdates
              ? html`
                  <div class="stat">
                    <div class="stat-value">${updatesCount}</div>
                    <div class="stat-label">Updates</div>
                  </div>
                `
              : nothing}
            ${showContainers
              ? html`
                  <div class="stat">
                    <div class="stat-value ${!hasContainerRow ? "muted" : ""}">
                      ${hasContainerRow
                        ? html`${containersRunning ?? "–"}${containersTotal !== undefined ? html`/${containersTotal}` : nothing}`
                        : "–"}
                    </div>
                    <div class="stat-label">Containers</div>
                  </div>
                `
              : nothing}
          </div>
        `
      : nothing;

    const gaugesBlock =
      showCpu || showGauge
        ? html`
            <div class="gauges">
              ${showCpu
                ? html`
                    <div class="gauge-item">
                      <div class="gauge"><mos-memory-gauge .value=${cpuPct} icon="mdi:chip"></mos-memory-gauge></div>
                      <div class="stat">
                        <div class="stat-value ${cpuPct === undefined ? "muted" : ""}">${cpuPct !== undefined ? `${cpuPct.toFixed(0)}%` : "–"}</div>
                        <div class="stat-label">CPU</div>
                      </div>
                    </div>
                  `
                : nothing}
              ${showGauge
                ? html`
                    <div class="gauge-item">
                      <div class="gauge"><mos-memory-gauge .value=${gaugePct}></mos-memory-gauge></div>
                      <div class="stat">
                        <div class="stat-value">${hasGuests && memoryBytes !== undefined ? formatBytes(memoryBytes) : "–"}</div>
                        <div class="stat-label">Memory</div>
                      </div>
                    </div>
                  `
                : nothing}
            </div>
          `
        : nothing;

    return html`
      <ha-card
        class="layout-${layout}"
        @pointerdown=${this._onPointerDown}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerCancel}
      >
        <div class="row">
          <div class="icon-wrap">
            <div class="icon-badge" style="background:${accentColor}">
              <ha-icon icon=${icon}></ha-icon>
            </div>
            ${showBadges && hasProblem ? html`<ha-icon class="corner-badge problem" icon="mdi:alert-circle"></ha-icon>` : nothing}
            ${showBadges && hasUpdates ? html`<ha-icon class="corner-badge update" icon="mdi:update"></ha-icon>` : nothing}
            ${linkUrl
              ? html`
                  <ha-icon
                    class="corner-badge link"
                    icon="mdi:open-in-new"
                    title=${linkUrl}
                    @pointerdown=${(e: Event) => e.stopPropagation()}
                    @pointerup=${(e: Event) => e.stopPropagation()}
                    @click=${(e: Event) => this._openLink(e, linkUrl as string)}
                  ></ha-icon>
                `
              : nothing}
          </div>
          <div class="title-col">
            <div class="title">${title}</div>
            <div class="subtitle" ?data-empty=${!subtitleText}>${subtitleText || " "}</div>
          </div>
          ${layout === "gauge_first" ? gaugesBlock : countsBlock}
          ${layout === "gauge_first" ? countsBlock : gaugesBlock}
        </div>
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

  private _openLink(ev: Event, url: string): void {
    ev.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  static styles = css`
    ha-card {
      min-height: 50px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      padding: 7px 12px;
      cursor: pointer;
    }
    .empty {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
    }
    .icon-wrap {
      position: relative;
      flex: 0 0 auto;
    }
    .icon-badge {
      height: 34px;
      width: 34px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .icon-badge ha-icon {
      --mdc-icon-size: 19px;
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
    .corner-badge.link {
      bottom: -2px;
      left: -2px;
      background: var(--secondary-background-color, #444);
      color: var(--primary-text-color);
      cursor: pointer;
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
    .subtitle {
      font-size: 10px;
      line-height: 1.3;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .subtitle[data-empty] {
      visibility: hidden;
    }
    .counts {
      flex: 0 1 auto;
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
      min-width: 0;
    }
    .gauges {
      flex: 0 1 auto;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 12px;
    }
    .gauge-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .gauge-item .stat {
      align-items: flex-start;
    }
    .gauge {
      height: 34px;
      width: 34px;
      flex: 0 0 auto;
    }
    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 0;
    }
    .stat-value {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
    }
    .stat-value.muted {
      opacity: 0.5;
      font-weight: 400;
    }
    .stat-label {
      font-size: 8.5px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      line-height: 1.2;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }

    /* Compact layout: a deliberately shorter, denser variant for tighter dashboards. */
    ha-card.layout-compact {
      min-height: 40px;
      padding: 4px 8px;
    }
    .layout-compact .row {
      gap: 6px;
    }
    .layout-compact .icon-badge {
      height: 26px;
      width: 26px;
    }
    .layout-compact .icon-badge ha-icon {
      --mdc-icon-size: 15px;
    }
    .layout-compact .corner-badge {
      width: 11px;
      height: 11px;
      --mdc-icon-size: 8px;
    }
    .layout-compact .title {
      font-size: 13px;
    }
    .layout-compact .subtitle {
      font-size: 9px;
    }
    .layout-compact .stat-value {
      font-size: 11px;
    }
    .layout-compact .stat-label {
      font-size: 7.5px;
    }
    .layout-compact .gauge {
      height: 26px;
      width: 26px;
    }
    .layout-compact .counts,
    .layout-compact .gauges {
      gap: 8px;
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
  type: "mos-kind-title-card",
  name: "MOS Kind Title Card",
  description: "A compact ~50px title bar for one MOS virtualization kind (Docker/Compose/LXC/VMs): running count, updates/problem badges, and a host-RAM memory gauge.",
  preview: false,
});
