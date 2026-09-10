import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { MosSummaryCardConfig } from "./types";
import { formatValue, friendlyName, getState, isProblem, numericValue } from "./helpers";

const CARD_VERSION = "0.1.0";

// eslint-disable-next-line no-console
console.info(
  `%c MOS-SUMMARY-CARD %c v${CARD_VERSION} `,
  "color: white; background: #039be5; font-weight: 700;",
  "color: #039be5; background: white; font-weight: 700;"
);

@customElement("mos-summary-card")
export class MosSummaryCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: MosSummaryCardConfig;

  // No visual editor yet — configure via YAML. See README for options.
  public static getStubConfig(): Partial<MosSummaryCardConfig> {
    return {
      title: "NAS",
      storage_entities: [],
      container_entities: [],
      vm_entities: [],
    };
  }

  public setConfig(config: MosSummaryCardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = {
      title: "NAS",
      ...config,
    };
  }

  public getCardSize(): number {
    return 4;
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }

    const cpu = getState(this.hass, this._config.cpu_entity);
    const memory = getState(this.hass, this._config.memory_entity);
    const temperature = getState(this.hass, this._config.temperature_entity);
    const ups = getState(this.hass, this._config.ups_entity);

    const storage = (this._config.storage_entities ?? [])
      .map((id) => getState(this.hass, id))
      .filter(Boolean);
    const disks = (this._config.disk_entities ?? [])
      .map((id) => getState(this.hass, id))
      .filter(Boolean);
    const containers = (this._config.container_entities ?? [])
      .map((id) => getState(this.hass, id))
      .filter(Boolean);
    const vms = (this._config.vm_entities ?? [])
      .map((id) => getState(this.hass, id))
      .filter(Boolean);

    const hasVitals = cpu || memory || temperature;
    const hasAny =
      hasVitals || ups || storage.length || disks.length || containers.length || vms.length;

    return html`
      <ha-card .header=${this._config.title}>
        <div class="content">
          ${!hasAny
            ? html`<div class="empty">
                No entities configured yet. Edit this card to select MOS sensors.
              </div>`
            : nothing}
          ${hasVitals
            ? html`
                <div class="row vitals">
                  ${cpu ? this._renderStat("mdi:chip", "CPU", cpu) : nothing}
                  ${memory ? this._renderStat("mdi:memory", "Memory", memory) : nothing}
                  ${temperature
                    ? this._renderStat("mdi:thermometer", "Temp", temperature)
                    : nothing}
                </div>
              `
            : nothing}
          ${storage.length
            ? html`
                <div class="section">
                  <div class="section-title">Storage</div>
                  ${storage.map((s) => this._renderPill(s))}
                </div>
              `
            : nothing}
          ${disks.length
            ? html`
                <div class="section">
                  <div class="section-title">Disks</div>
                  ${disks.map((s) => this._renderPill(s))}
                </div>
              `
            : nothing}
          ${containers.length
            ? html`
                <div class="section">
                  <div class="section-title">
                    Containers · ${this._runningCount(containers)}/${containers.length} running
                  </div>
                </div>
              `
            : nothing}
          ${vms.length
            ? html`
                <div class="section">
                  <div class="section-title">
                    VMs · ${this._runningCount(vms)}/${vms.length} running
                  </div>
                </div>
              `
            : nothing}
          ${ups
            ? html`
                <div class="section">
                  <div class="section-title">UPS</div>
                  ${this._renderPill(ups)}
                </div>
              `
            : nothing}
        </div>
      </ha-card>
    `;
  }

  private _runningCount(entities: (ReturnType<typeof getState>)[]): number {
    return entities.filter((e) => e && e.state === "on").length;
  }

  private _renderStat(icon: string, label: string, stateObj: ReturnType<typeof getState>) {
    const n = numericValue(stateObj);
    return html`
      <div class="stat">
        <ha-icon icon=${icon}></ha-icon>
        <div class="stat-value">${formatValue(stateObj)}</div>
        <div class="stat-label">${label}</div>
        ${n !== undefined
          ? html`<div class="bar"><div class="bar-fill" style="width:${Math.min(n, 100)}%"></div></div>`
          : nothing}
      </div>
    `;
  }

  private _renderPill(stateObj: ReturnType<typeof getState>) {
    const problem = isProblem(stateObj);
    return html`
      <div class="pill ${problem ? "problem" : "ok"}">
        <span class="dot"></span>
        <span class="pill-name">${friendlyName(stateObj, stateObj?.entity_id ?? "")}</span>
        <span class="pill-value">${formatValue(stateObj)}</span>
      </div>
    `;
  }

  static styles = css`
    ha-card {
      padding: 8px 16px 16px;
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .empty {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      padding: 8px 0;
    }
    .row.vitals {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .stat {
      flex: 1 1 90px;
      min-width: 90px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
    .stat ha-icon {
      color: var(--state-icon-color, var(--paper-item-icon-color));
    }
    .stat-value {
      font-size: 1.1em;
      font-weight: 500;
    }
    .stat-label {
      font-size: 0.8em;
      color: var(--secondary-text-color);
    }
    .bar {
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: var(--divider-color);
      overflow: hidden;
      margin-top: 2px;
    }
    .bar-fill {
      height: 100%;
      background: var(--primary-color);
    }
    .section-title {
      font-size: 0.8em;
      font-weight: 500;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }
    .pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 0.9em;
    }
    .pill-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pill-value {
      color: var(--secondary-text-color);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--state-icon-color, var(--disabled-color));
    }
    .pill.ok .dot {
      background: var(--success-color, #43a047);
    }
    .pill.problem .dot {
      background: var(--error-color, #db4437);
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
  type: "mos-summary-card",
  name: "MOS Summary Card",
  description: "Summarizes a MOS NAS device: CPU, memory, temperature, storage pools, containers, VMs, and UPS.",
  preview: false,
});
