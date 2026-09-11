import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireEvent } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { MosServerSummaryCardConfig } from "./types";
import { DEFAULT_SECTION_ORDER } from "./types";
import { findServerDevices, subscribeDeviceRegistry } from "./devices";
import type { DeviceRegistryEntry } from "./devices";

interface SelectOption {
  value: string;
  label: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = any;

/** Reuse HA's own core translations for the three whole-card gesture fields, so labels/wording match every other card editor. */
const ACTION_LOCALIZE_KEYS: Readonly<Record<string, string>> = {
  tap_action: "ui.panel.lovelace.editor.card.generic.tap_action",
  hold_action: "ui.panel.lovelace.editor.card.generic.hold_action",
  double_tap_action: "ui.panel.lovelace.editor.card.generic.double_tap_action",
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  server: "MOS server",
  title: "Title",
  image: "Header image URL",
  image_size: "Header image size",
  show_uptime: "Show boot time / uptime",
  uptime_style: "Boot time display",
  show_info: "Show basic info",
  show_cpu_metric: "Show CPU load",
  show_memory_metric: "Show memory usage",
  history_hours: "History window",
  sparkline_show_value_scale: "Show sparkline value scale (0/50/100%)",
  sparkline_show_time_scale: "Show sparkline time scale",
  show_pools: "Show storage pools",
  pool_labels: "Pool label overrides",
  pool_tap_action: "Pool tap action",
  pool_hold_action: "Pool hold action",
  pool_double_tap_action: "Pool double-tap action",
  show_cpu_temp: "Show CPU temperature",
  cpu_temp_tap_action: "CPU temperature tap action",
  cpu_temp_hold_action: "CPU temperature hold action",
  cpu_temp_double_tap_action: "CPU temperature double-tap action",
  show_network: "Show network connectivity",
  show_services: "Show service status",
  services_style: "Service status layout",
  show_disk_health: "Show disk health",
  show_guest_status: "Show guest updates/problems",
  guest_status_style: "Guest status layout",
  section_order: "Section order",
};

const HISTORY_HOURS_OPTIONS: SelectOption[] = [
  { value: "1", label: "1 hour" },
  { value: "3", label: "3 hours" },
  { value: "6", label: "6 hours" },
  { value: "12", label: "12 hours" },
  { value: "24", label: "24 hours" },
];

const UPTIME_STYLE_OPTIONS: SelectOption[] = [
  { value: "relative", label: "Relative (“2 days ago”)" },
  { value: "uptime_compact", label: "Uptime, compact (“2d 4h 13m”)" },
  { value: "uptime_verbose", label: "Uptime, verbose (“2 days, 4 hours, 13 minutes”)" },
];

const GUEST_STATUS_STYLE_OPTIONS: SelectOption[] = [
  { value: "badges", label: "Icon badges" },
  { value: "text", label: "Static text" },
  { value: "ticker", label: "Scrolling ticker" },
];

const SERVICES_STYLE_OPTIONS: SelectOption[] = [
  { value: "compact", label: "Compact (icon only)" },
  { value: "labeled", label: "Labeled chips" },
  { value: "detailed", label: "Detailed rows" },
];

const SECTION_OPTIONS: SelectOption[] = [
  { value: "info", label: "Basic Info" },
  { value: "metrics", label: "System Metrics" },
  { value: "pools_temp", label: "Storage Pools + CPU Temperature" },
  { value: "guest_status", label: "Guest Status" },
  { value: "services", label: "Network & Services" },
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

  /**
   * Grouped into expandable sections (config stays flat — every group uses
   * `flatten: true`) so ~30 fields stay manageable, with sub-fields spliced
   * in only when their governing toggle is currently on (the same
   * conditional-inclusion technique mos-kind-title-card's editor uses for
   * `show_containers`).
   */
  private _schema(): Schema[] {
    const showUptime = this._config?.show_uptime ?? true;
    const showPools = this._config?.show_pools ?? true;
    const showCpuTemp = this._config?.show_cpu_temp ?? true;
    const showGuestStatus = this._config?.show_guest_status ?? true;
    const showServices = this._config?.show_services ?? true;

    return [
      {
        name: "server",
        required: true,
        selector: { select: { mode: "dropdown", options: this._servers } },
      },
      { name: "title", selector: { text: {} } },
      {
        type: "expandable",
        name: "header_group",
        title: "Header",
        flatten: true,
        schema: [
          { name: "image", selector: { text: {} } },
          {
            name: "image_size",
            selector: { number: { min: 24, max: 96, step: 2, mode: "slider", unit_of_measurement: "px" } },
          },
          { name: "show_uptime", selector: { boolean: {} } },
          ...(showUptime
            ? [{ name: "uptime_style", selector: { select: { mode: "dropdown", options: UPTIME_STYLE_OPTIONS } } }]
            : []),
        ],
      },
      {
        type: "expandable",
        name: "info_group",
        title: "Basic Info",
        flatten: true,
        schema: [{ name: "show_info", selector: { boolean: {} } }],
      },
      {
        type: "expandable",
        name: "metrics_group",
        title: "System Metrics",
        flatten: true,
        schema: [
          { name: "show_cpu_metric", selector: { boolean: {} } },
          { name: "show_memory_metric", selector: { boolean: {} } },
          { name: "history_hours", selector: { select: { mode: "dropdown", options: HISTORY_HOURS_OPTIONS } } },
          { name: "sparkline_show_value_scale", selector: { boolean: {} } },
          { name: "sparkline_show_time_scale", selector: { boolean: {} } },
        ],
      },
      {
        type: "expandable",
        name: "pools_group",
        title: "Storage Pools",
        flatten: true,
        schema: [
          { name: "show_pools", selector: { boolean: {} } },
          ...(showPools
            ? [
                { name: "pool_labels", selector: { object: {} } },
                { name: "pool_tap_action", selector: { ui_action: {} } },
                { name: "pool_hold_action", selector: { ui_action: {} } },
                { name: "pool_double_tap_action", selector: { ui_action: {} } },
              ]
            : []),
        ],
      },
      {
        type: "expandable",
        name: "cpu_temp_group",
        title: "CPU Temperature",
        flatten: true,
        schema: [
          { name: "show_cpu_temp", selector: { boolean: {} } },
          ...(showCpuTemp
            ? [
                { name: "cpu_temp_tap_action", selector: { ui_action: {} } },
                { name: "cpu_temp_hold_action", selector: { ui_action: {} } },
                { name: "cpu_temp_double_tap_action", selector: { ui_action: {} } },
              ]
            : []),
        ],
      },
      {
        type: "expandable",
        name: "guest_status_group",
        title: "Guest Status",
        flatten: true,
        schema: [
          { name: "show_guest_status", selector: { boolean: {} } },
          ...(showGuestStatus
            ? [
                {
                  name: "guest_status_style",
                  selector: { select: { mode: "dropdown", options: GUEST_STATUS_STYLE_OPTIONS } },
                },
              ]
            : []),
        ],
      },
      {
        type: "expandable",
        name: "network_services_group",
        title: "Network & Services",
        flatten: true,
        schema: [
          { name: "show_network", selector: { boolean: {} } },
          { name: "show_services", selector: { boolean: {} } },
          ...(showServices
            ? [{ name: "services_style", selector: { select: { mode: "dropdown", options: SERVICES_STYLE_OPTIONS } } }]
            : []),
          { name: "show_disk_health", selector: { boolean: {} } },
        ],
      },
      {
        type: "expandable",
        name: "order_group",
        title: "Section Order",
        flatten: true,
        schema: [
          { name: "section_order", selector: { select: { multiple: true, reorder: true, options: SECTION_OPTIONS } } },
        ],
      },
      {
        type: "expandable",
        name: "interactions_group",
        title: "Interactions",
        flatten: true,
        schema: [
          { name: "tap_action", selector: { ui_action: {} } },
          { name: "hold_action", selector: { ui_action: {} } },
          { name: "double_tap_action", selector: { ui_action: {} } },
        ],
      },
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
   * `?? true` / `?? "..."` fallbacks in mos-server-summary-card.ts, or the
   * editor would show a field's default state while the card behaves
   * differently.
   */
  private _data(config: MosServerSummaryCardConfig): MosServerSummaryCardConfig {
    return {
      image_size: 40,
      show_uptime: true,
      uptime_style: "relative",
      show_info: true,
      show_cpu_metric: true,
      show_memory_metric: true,
      // ha-form's select selector compares by string, but the stored config
      // value is a number — keep the field itself numeric and only stringify
      // for the selector at the option level (see HISTORY_HOURS_OPTIONS).
      history_hours: 3,
      sparkline_show_value_scale: false,
      sparkline_show_time_scale: false,
      show_pools: true,
      pool_labels: {},
      show_cpu_temp: true,
      show_network: true,
      show_services: true,
      services_style: "compact",
      show_disk_health: true,
      show_guest_status: true,
      guest_status_style: "badges",
      section_order: [...DEFAULT_SECTION_ORDER],
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
