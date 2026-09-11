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

const CARD_VERSION = "1.0.0";

// eslint-disable-next-line no-console
console.info(
  `%c MOS-KIND-TITLE-CARD %c v${CARD_VERSION} `,
  "color: white; background: #039be5; font-weight: 700;",
  "color: #039be5; background: white; font-weight: 700;",
);

/** What discovery resolved for the current server + kind. Recomputed only when the registries or config change, never on a bare `hass` tick. */
interface Resolved {
  serverFound: boolean;
  memoryTotalEntity?: string;
  guestCount: number;
  summaryEntities: Partial<Record<SummarySensorId, string>>;
  memoryEntities: string[];
  problemEntities: string[];
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

    const serverFound = findServerDevices(this._devices).some((device) => device.id === serverId);
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
    const problemEntities: string[] = [];
    for (const guest of guests) {
      const guestEntities = byDevice.get(guest.id) ?? [];
      const memory = findMetricEntity(guestEntities, kind.memoryMetric);
      if (memory) {
        memoryEntities.push(memory.entity_id);
      }
      for (const candidate of findProblemBinarySensors(guestEntities)) {
        problemEntities.push(candidate.entity_id);
      }
    }

    return { serverFound, memoryTotalEntity, guestCount: guests.length, summaryEntities, memoryEntities, problemEntities };
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
    const hass = this.hass;

    const updatesEntityId = resolved.summaryEntities.updates;
    const updatesCount = updatesEntityId ? Number(hass.states[updatesEntityId]?.state) : undefined;
    const hasUpdateBadge = typeof updatesCount === "number" && Number.isFinite(updatesCount) && updatesCount > 0;

    const hasProblemBadge = resolved.problemEntities.some((entityId) => {
      const stateObj = hass.states[entityId];
      return stateObj?.attributes.device_class === "problem" && stateObj.state === "on";
    });
    const hasAnyBadge = hasUpdateBadge || hasProblemBadge;

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

    return html`
      <ha-card
        @pointerdown=${this._onPointerDown}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerCancel}
      >
        <div class="row">
          <div class="icon"><ha-icon icon=${kind.icon}></ha-icon></div>
          <div class="title-col">
            <div class="title">${title}</div>
            <div class="badges" ?data-empty=${!hasAnyBadge}>
              ${hasUpdateBadge ? html`<ha-icon class="badge update" icon="mdi:update"></ha-icon>` : nothing}
              ${hasProblemBadge ? html`<ha-icon class="badge problem" icon="mdi:alert-circle"></ha-icon>` : nothing}
              ${!hasAnyBadge ? html`<ha-icon class="badge placeholder" icon="mdi:circle-small"></ha-icon>` : nothing}
            </div>
          </div>
          <div class="counts">
            ${hasCountRow
              ? html`<div class="count-row">${runningState ?? "–"}${totalState !== undefined ? html`/${totalState}` : nothing}</div>`
              : html`<div class="count-row muted">–</div>`}
            ${updatesEntityId
              ? html`<div class="count-row"><ha-icon icon="mdi:update"></ha-icon>${hass.states[updatesEntityId]?.state ?? "–"}</div>`
              : nothing}
          </div>
          <div class="memory">
            <div class="gauge"><mos-memory-gauge .value=${gaugePct}></mos-memory-gauge></div>
            <div class="memory-label">${hasGuests && memoryBytes !== undefined ? formatBytes(memoryBytes) : "–"}</div>
          </div>
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

  static styles = css`
    ha-card {
      height: 50px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      padding: 0 12px;
      overflow: hidden;
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
      gap: 10px;
      width: 100%;
      min-width: 0;
    }
    .icon {
      flex: 0 0 auto;
      height: 32px;
      width: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--state-icon-color, var(--paper-item-icon-color));
    }
    .icon ha-icon {
      --mdc-icon-size: 28px;
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
    .badges {
      height: 14px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .badges[data-empty] {
      visibility: hidden;
    }
    .badge {
      --mdc-icon-size: 13px;
    }
    .badge.update {
      color: var(--info-color, #039be5);
    }
    .badge.problem {
      color: var(--error-color, #db4437);
    }
    .counts {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 1px;
      font-size: 12px;
      color: var(--secondary-text-color);
      min-width: 34px;
    }
    .count-row {
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
    }
    .count-row.muted {
      opacity: 0.6;
    }
    .count-row ha-icon {
      --mdc-icon-size: 12px;
    }
    .memory {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .gauge {
      height: 34px;
      width: 34px;
      flex: 0 0 auto;
    }
    .memory-label {
      font-size: 12px;
      color: var(--secondary-text-color);
      white-space: nowrap;
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
