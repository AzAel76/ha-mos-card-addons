import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireEvent } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { MosServerSummaryCardConfig } from "./types";
import { findServerDevices, subscribeDeviceRegistry } from "./devices";
import type { DeviceRegistryEntry } from "./devices";

interface SelectOption {
  value: string;
  label: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = any;

/** Reuse HA's own core translations for the three gesture fields, so labels/wording match every other card editor. */
const ACTION_LOCALIZE_KEYS: Readonly<Record<string, string>> = {
  tap_action: "ui.panel.lovelace.editor.card.generic.tap_action",
  hold_action: "ui.panel.lovelace.editor.card.generic.hold_action",
  double_tap_action: "ui.panel.lovelace.editor.card.generic.double_tap_action",
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  server: "MOS server",
  title: "Title",
  image: "Header image URL",
  show_uptime: "Show boot time",
  show_info: "Show basic info",
  show_cpu_metric: "Show CPU load",
  show_memory_metric: "Show memory usage",
  history_hours: "History window",
  show_pools: "Show storage pools",
  show_cpu_temp: "Show CPU temperature",
  show_network: "Show network connectivity",
  show_services: "Show service status",
  show_disk_health: "Show disk health",
  show_guest_status: "Show guest updates/problems badge",
};

const HISTORY_HOURS_OPTIONS: SelectOption[] = [
  { value: "1", label: "1 hour" },
  { value: "3", label: "3 hours" },
  { value: "6", label: "6 hours" },
  { value: "12", label: "12 hours" },
  { value: "24", label: "24 hours" },
];

@customElement("mos-server-summary-card-editor")
export class MosServerSummaryCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: MosServerSummaryCardConfig;

  /** Populated live from the device registry; seeded with a placeholder for the current value so the field doesn't flash blank while that subscription resolves. */
  @state() private _servers: SelectOption[] = [];

  private _unsubscribe?: UnsubscribeFunc;

  public setConfig(config: MosServerSummaryCardConfig): void {
    this._config = config;
    if (config.server && !this._servers.some((option) => option.value === config.server)) {
      this._servers = [...this._servers, { value: config.server, label: config.server }];
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribe();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has("hass")) {
      this._subscribe();
    }
  }

  private _subscribe(): void {
    if (this._unsubscribe || !this.isConnected || !this.hass?.connection) {
      return;
    }
    // custom-card-helpers bundles its own (older) home-assistant-js-websocket,
    // so `hass.connection`'s Connection type is nominally distinct from ours
    // even though the runtime object is identical — bridge the duplicate-
    // dependency type clash with a cast rather than pinning our own version
    // down to their much older one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._unsubscribe = subscribeDeviceRegistry(this.hass.connection as any, (devices: DeviceRegistryEntry[]) => {
      this._servers = findServerDevices(devices).map((device) => ({
        value: device.id,
        label: device.name_by_user || device.name || device.id,
      }));
    });
  }

  private _schema(): Schema[] {
    return [
      {
        name: "server",
        required: true,
        selector: { select: { mode: "dropdown", options: this._servers } },
      },
      { name: "title", selector: { text: {} } },
      { name: "image", selector: { text: {} } },
      { name: "show_uptime", selector: { boolean: {} } },
      { name: "show_info", selector: { boolean: {} } },
      { name: "show_cpu_metric", selector: { boolean: {} } },
      { name: "show_memory_metric", selector: { boolean: {} } },
      { name: "history_hours", selector: { select: { mode: "dropdown", options: HISTORY_HOURS_OPTIONS } } },
      { name: "show_pools", selector: { boolean: {} } },
      { name: "show_cpu_temp", selector: { boolean: {} } },
      { name: "show_network", selector: { boolean: {} } },
      { name: "show_services", selector: { boolean: {} } },
      { name: "show_disk_health", selector: { boolean: {} } },
      { name: "show_guest_status", selector: { boolean: {} } },
      { name: "tap_action", selector: { ui_action: {} } },
      { name: "hold_action", selector: { ui_action: {} } },
      { name: "double_tap_action", selector: { ui_action: {} } },
    ];
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._data(this._config)}
        .schema=${this._schema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  /**
   * Defaults filled in for display only — these must match the card's own
   * `?? true` / `?? 3` fallbacks in mos-server-summary-card.ts, or the
   * editor would show a toggle's default state while the card behaves
   * differently.
   */
  private _data(config: MosServerSummaryCardConfig): MosServerSummaryCardConfig {
    return {
      show_uptime: true,
      show_info: true,
      show_cpu_metric: true,
      show_memory_metric: true,
      // ha-form's select selector compares by string, but the stored config
      // value is a number — keep the field itself numeric and only stringify
      // for the selector at the option level (see HISTORY_HOURS_OPTIONS).
      history_hours: 3,
      show_pools: true,
      show_cpu_temp: true,
      show_network: true,
      show_services: true,
      show_disk_health: true,
      show_guest_status: true,
      ...config,
    };
  }

  private _computeLabel = (schema: Schema): string => {
    const localizeKey = ACTION_LOCALIZE_KEYS[schema.name];
    if (localizeKey) {
      return this.hass.localize(localizeKey) || schema.name;
    }
    return FIELD_LABELS[schema.name] ?? schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const value = { ...ev.detail.value };
    if (typeof value.history_hours === "string") {
      value.history_hours = Number(value.history_hours);
    }
    fireEvent(this, "config-changed", { config: { ...this._config, ...value } });
  }

  static styles = css`
    ha-form {
      display: block;
    }
  `;
}
