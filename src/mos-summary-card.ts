import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import { KIND_IDS, type MosKindFields, type MosSummaryCardConfig } from "./types";
import { KIND_DEFAULTS } from "./kinds";
import {
  countOn,
  countProblems,
  formatValue,
  getState,
  getStates,
  numericValue,
  sumNumeric,
} from "./helpers";

const CARD_VERSION = "0.3.0";

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

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("./editor/mos-summary-card-editor");
    return document.createElement("mos-summary-card-editor") as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): Partial<MosSummaryCardConfig> {
    return {
      title: "NAS",
      docker_container: { state_entities: [], stat_entities: [] },
      compose_stack: { state_entities: [], stat_entities: [] },
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
    const kindCount = KIND_IDS.filter((k) => this._config?.[k]).length;
    return 2 + kindCount;
  }

  protected render() {
    if (!this._config || !this.hass) {
      return nothing;
    }

    const cpu = getState(this.hass, this._config.cpu_entity);
    const memory = getState(this.hass, this._config.memory_entity);
    const temperature = getState(this.hass, this._config.temperature_entity);
    const hasVitals = cpu || memory || temperature;

    const kindEntries = KIND_IDS.map((id) => [id, this._config[id]] as const).filter(
      ([, fields]) => fields
    );

    return html`
      <ha-card .header=${this._config.title}>
        <div class="content">
          ${!hasVitals && !kindEntries.length
            ? html`<div class="empty">
                No entities configured yet. Edit this card to select MOS sensors.
              </div>`
            : nothing}
          ${hasVitals
            ? html`
                <div class="row vitals">
                  ${cpu ? this._renderVital("mdi:chip", "CPU", cpu) : nothing}
                  ${memory ? this._renderVital("mdi:memory", "Memory", memory) : nothing}
                  ${temperature
                    ? this._renderVital("mdi:thermometer", "Temp", temperature)
                    : nothing}
                </div>
              `
            : nothing}
          <div class="banners">
            ${kindEntries.map(([id, fields]) => this._renderBanner(id, fields as MosKindFields))}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _renderVital(icon: string, label: string, stateObj: ReturnType<typeof getState>) {
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

  private _renderBanner(kindId: (typeof KIND_IDS)[number], fields: MosKindFields) {
    const defaults = KIND_DEFAULTS[kindId];

    const stateEntities = getStates(this.hass, fields.state_entities);
    const statEntities = getStates(this.hass, fields.stat_entities);

    if (!stateEntities.length && !statEntities.length) {
      return nothing;
    }

    const name = fields.name ?? defaults.name;
    const icon = fields.icon ?? defaults.icon;
    const statLabel = fields.stat_label ?? defaults.statLabel;
    const statIcon = fields.stat_icon ?? defaults.statIcon;
    const stat = sumNumeric(statEntities);

    let subtitle: string | undefined;
    let accent: "neutral" | "active" | "problem" = "neutral";

    if (defaults.mode === "running") {
      if (stateEntities.length) {
        const on = countOn(stateEntities);
        subtitle = `${on}/${stateEntities.length} running`;
        accent = on > 0 ? "active" : "neutral";
      }
    } else {
      if (stateEntities.length) {
        const problems = countProblems(stateEntities);
        subtitle = problems > 0 ? `${problems} issue${problems === 1 ? "" : "s"}` : "All healthy";
        accent = problems > 0 ? "problem" : "active";
      }
    }

    return html`
      <div class="banner ${accent}">
        <div class="banner-icon">
          <ha-icon icon=${icon}></ha-icon>
        </div>
        <div class="banner-main">
          <div class="banner-name">${name}</div>
          ${subtitle ? html`<div class="banner-subtitle">${subtitle}</div>` : nothing}
        </div>
        ${stat
          ? html`
              <div class="banner-stat">
                <ha-icon icon=${statIcon}></ha-icon>
                <div class="banner-stat-text">
                  <div class="banner-stat-value">${stat.value}${stat.unit ? ` ${stat.unit}` : ""}</div>
                  <div class="banner-stat-label">${statLabel}</div>
                </div>
              </div>
            `
          : nothing}
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
    .banners {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.08));
    }
    .banner-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--disabled-color, #9e9e9e);
      color: var(--card-background-color, #fff);
    }
    .banner.active .banner-icon {
      background: var(--primary-color);
    }
    .banner.problem .banner-icon {
      background: var(--error-color, #db4437);
    }
    .banner-main {
      flex: 1;
      min-width: 0;
    }
    .banner-name {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .banner-subtitle {
      font-size: 0.8em;
      color: var(--secondary-text-color);
    }
    .banner-stat {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .banner-stat ha-icon {
      color: var(--secondary-text-color);
    }
    .banner-stat-text {
      text-align: right;
    }
    .banner-stat-value {
      font-weight: 500;
    }
    .banner-stat-label {
      font-size: 0.75em;
      color: var(--secondary-text-color);
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
  description:
    "Banner-style summary of a MOS NAS device by kind: Docker, Compose Stacks, LXC, VMs, Disks, Storage Pools, UPS.",
  preview: false,
});
