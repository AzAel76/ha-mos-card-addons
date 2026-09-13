import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireEvent } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import type { MosDetailCardConfig } from "./types";
import { DETAIL_KIND_DEFS } from "./detail-kinds";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = any;

/** Reuse HA's own core translations for the three gesture fields, so labels/wording match every other card editor. */
const ACTION_LOCALIZE_KEYS: Readonly<Record<string, string>> = {
  tap_action: "ui.panel.lovelace.editor.card.generic.tap_action",
  hold_action: "ui.panel.lovelace.editor.card.generic.hold_action",
  double_tap_action: "ui.panel.lovelace.editor.card.generic.double_tap_action",
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  device_id: "Device",
  kind: "Kind override",
  title: "Title",
  show_identity: "Show identity",
  show_stats: "Show current-value stats",
  show_history: "Show history sparkline(s)",
  history_hours: "History lookback (hours)",
  sparkline_show_value_scale: "Sparkline: show value scale",
  sparkline_show_time_scale: "Sparkline: show time scale",
  container_count_style: "Compose: container count position",
  show_containers: "Compose: show container list",
  containers_list_style: "Compose: container list style",
  show_status: "Show status badges",
  show_power_toggle: "Show power toggle",
  cpu_temp_detail_style: "Server: temperature layout",
  show_hardware_sensors: "Server: show hardware sensors (System group)",
};

const CONTAINER_COUNT_STYLE_OPTIONS = [
  { value: "stats", label: "Stats section" },
  { value: "subtitle", label: "Identity subtitle" },
];

const CONTAINERS_LIST_STYLE_OPTIONS = [
  { value: "list", label: "Vertical list" },
  { value: "chips", label: "Chip row" },
];

const CPU_TEMP_DETAIL_STYLE_OPTIONS = [
  { value: "bars", label: "Horizontal bars" },
  { value: "grid", label: "Gauge grid" },
  { value: "history", label: "Gauge + history (Main only)" },
];

@customElement("mos-detail-card-editor")
export class MosDetailCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: MosDetailCardConfig;

  public setConfig(config: MosDetailCardConfig): void {
    this._config = config;
  }

  private _schema(): Schema[] {
    return [
      {
        name: "device_id",
        required: true,
        // Scoped to the ha-mos integration's own devices — this card is
        // driven by one specific already-known device, unlike the other two
        // packages which discover children of a chosen server.
        selector: { device: { filter: { integration: "mos" } } },
      },
      {
        name: "kind",
        selector: {
          select: {
            mode: "dropdown",
            options: Object.values(DETAIL_KIND_DEFS).map((kind) => ({ value: kind.id, label: kind.name })),
          },
        },
      },
      { name: "title", selector: { text: {} } },
      { name: "show_identity", selector: { boolean: {} } },
      { name: "show_stats", selector: { boolean: {} } },
      { name: "show_history", selector: { boolean: {} } },
      ...(this._config?.show_history !== false
        ? [
            { name: "history_hours", selector: { number: { mode: "box", min: 1, max: 24, step: 1 } } },
            { name: "sparkline_show_value_scale", selector: { boolean: {} } },
            { name: "sparkline_show_time_scale", selector: { boolean: {} } },
          ]
        : []),
      // Compose-only, but always shown (no live kind detection at editor
      // build time — see mos-detail-card.ts): a no-op for every other kind,
      // same precedent as show_power_toggle.
      {
        name: "container_count_style",
        selector: { select: { mode: "dropdown", options: CONTAINER_COUNT_STYLE_OPTIONS } },
      },
      { name: "show_containers", selector: { boolean: {} } },
      ...(this._config?.show_containers !== false
        ? [
            {
              name: "containers_list_style",
              selector: { select: { mode: "dropdown", options: CONTAINERS_LIST_STYLE_OPTIONS } },
            },
          ]
        : []),
      { name: "show_status", selector: { boolean: {} } },
      { name: "show_power_toggle", selector: { boolean: {} } },
      // Server-only, but always shown — same no-op-elsewhere precedent.
      {
        name: "cpu_temp_detail_style",
        selector: { select: { mode: "dropdown", options: CPU_TEMP_DETAIL_STYLE_OPTIONS } },
      },
      { name: "show_hardware_sensors", selector: { boolean: {} } },
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
   * `?? true` fallbacks in mos-detail-card.ts, or the editor would show a
   * toggle's default state while the card behaves differently.
   */
  private _data(config: MosDetailCardConfig): MosDetailCardConfig {
    return {
      show_identity: true,
      show_stats: true,
      show_history: true,
      history_hours: 3,
      sparkline_show_value_scale: false,
      sparkline_show_time_scale: false,
      container_count_style: "stats",
      show_containers: true,
      containers_list_style: "list",
      show_status: true,
      show_power_toggle: true,
      cpu_temp_detail_style: "bars",
      show_hardware_sensors: true,
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
    fireEvent(this, "config-changed", { config: { ...this._config, ...ev.detail.value } });
  }

  static styles = css`
    ha-form {
      display: block;
    }
  `;
}
