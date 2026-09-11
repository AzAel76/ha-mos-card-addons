import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireEvent } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { MosKindTitleCardConfig } from "./types";
import { KIND_DEFS, KIND_IDS } from "./kinds";
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
  kind: "Kind",
  title: "Title",
  icon: "Icon",
  icon_style: "Icon style",
  icon_shape: "Icon shape",
  color: "Icon background color",
  icon_color: "Icon color",
  layout: "Layout",
  show_badges: "Show badges",
  show_counts: "Show counts",
  show_gauge: "Show memory gauge",
  show_cpu: "Show CPU usage",
  show_link: "Show MOS UI link",
  link_path: "Link path override",
  link_style: "Link style",
  show_containers: "Show container count",
};

const LAYOUT_OPTIONS: SelectOption[] = [
  { value: "standard", label: "Standard" },
  { value: "compact", label: "Compact" },
  { value: "gauge_first", label: "Gauge first" },
];

const ICON_STYLE_OPTIONS: SelectOption[] = [
  { value: "filled", label: "Filled" },
  { value: "transparent", label: "Transparent" },
];

const ICON_SHAPE_OPTIONS: SelectOption[] = [
  { value: "circle", label: "Circle" },
  { value: "square", label: "Square" },
];

const LINK_STYLE_OPTIONS: SelectOption[] = [
  { value: "badge", label: "Corner badge on icon" },
  { value: "button", label: "Standalone button" },
];

@customElement("mos-kind-title-card-editor")
export class MosKindTitleCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: MosKindTitleCardConfig;

  /** Populated live from the device registry; seeded with a placeholder for the current value so the field doesn't flash blank while that subscription resolves. */
  @state() private _servers: SelectOption[] = [];

  private _unsubscribe?: UnsubscribeFunc;

  public setConfig(config: MosKindTitleCardConfig): void {
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
    const kind = this._config?.kind ? KIND_DEFS[this._config.kind] : undefined;
    return [
      {
        name: "server",
        required: true,
        selector: { select: { mode: "dropdown", options: this._servers } },
      },
      {
        name: "kind",
        required: true,
        selector: {
          select: {
            mode: "dropdown",
            options: KIND_IDS.map((id) => ({ value: id, label: KIND_DEFS[id].name })),
          },
        },
      },
      { name: "title", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
      { name: "icon_style", selector: { select: { mode: "dropdown", options: ICON_STYLE_OPTIONS } } },
      { name: "icon_shape", selector: { select: { mode: "dropdown", options: ICON_SHAPE_OPTIONS } } },
      { name: "color", selector: { ui_color: {} } },
      { name: "icon_color", selector: { ui_color: {} } },
      { name: "layout", selector: { select: { mode: "dropdown", options: LAYOUT_OPTIONS } } },
      { name: "show_badges", selector: { boolean: {} } },
      { name: "show_counts", selector: { boolean: {} } },
      { name: "show_gauge", selector: { boolean: {} } },
      { name: "show_cpu", selector: { boolean: {} } },
      { name: "show_link", selector: { boolean: {} } },
      { name: "link_style", selector: { select: { mode: "dropdown", options: LINK_STYLE_OPTIONS } } },
      { name: "link_path", selector: { text: {} } },
      // Only compose has a containers-within-stacks ratio distinct from
      // stacks running/total — omitted for kinds that couldn't use it.
      ...(kind?.containerRatioMetrics ? [{ name: "show_containers", selector: { boolean: {} } }] : []),
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
   * `?? true` / `?? "standard"` fallbacks in mos-kind-title-card.ts, or the
   * editor would show a toggle's default state while the card behaves
   * differently.
   */
  private _data(config: MosKindTitleCardConfig): MosKindTitleCardConfig {
    return {
      layout: "standard",
      icon_style: "filled",
      icon_shape: "circle",
      show_badges: true,
      show_counts: true,
      show_gauge: true,
      show_cpu: false,
      show_link: true,
      link_style: "badge",
      show_containers: false,
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
