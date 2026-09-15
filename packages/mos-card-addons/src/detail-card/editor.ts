import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireEvent } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { MosDetailCardConfig } from "./types";
import { DETAIL_KIND_DEFS, findKindByModelId } from "./detail-kinds";
import type { DetailKindId } from "./detail-kinds";
import {
  findDeviceById,
  findServerDevices,
  isServerDevice,
  selectGuestDevicesOfKind,
  selectPoolDevices,
  selectDiskDevices,
  poolDisplayName,
  diskDisplayName,
  subscribeDeviceRegistry,
} from "./devices";
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
  _server: "MOS server",
  _device_kind: "Kind",
  device_id: "Device",
  kind: "Kind override (rare — only needed if auto-detection picks the wrong kind)",
  title: "Title",
  show_identity: "Show identity",
  show_stats: "Show current-value stats",
  show_history: "Show history sparkline(s)",
  history_hours: "History lookback (hours)",
  sparkline_show_value_scale: "Sparkline: show value scale",
  sparkline_show_time_scale: "Sparkline: show time scale",
  container_count_style: "Container count position",
  show_containers: "Show container list",
  containers_list_style: "Container list style",
  show_status: "Show status badges",
  show_power_toggle: "Show power toggle",
  cpu_temp_detail_style: "Temperature layout",
  show_hardware_sensors: "Show hardware sensors (System group)",
  show_pool_disks: "Show member/parity disks",
  pool_disk_layout: "Disk arrangement",
  pool_disk_value_style: "Disk value style",
  pool_disk_attributes: "Disk attributes to show",
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

const POOL_DISK_LAYOUT_OPTIONS = [
  { value: "rows", label: "Rows" },
  { value: "grid", label: "Grid" },
];

const POOL_DISK_VALUE_STYLE_OPTIONS = [
  { value: "gauge", label: "Gauge" },
  { value: "bar", label: "Bar" },
  { value: "text", label: "Text" },
];

const POOL_DISK_ATTRIBUTE_OPTIONS = [
  { value: "model", label: "Model" },
  { value: "type", label: "Type" },
  { value: "size", label: "Size" },
  { value: "power_status", label: "Power status" },
  { value: "smart_warning", label: "SMART warning" },
  { value: "temperature", label: "Temperature" },
];

const KIND_OPTIONS: SelectOption[] = Object.values(DETAIL_KIND_DEFS).map((kindDef) => ({
  value: kindDef.id,
  label: kindDef.name,
}));

/** A generic, guaranteed-to-exist "off" glyph for a group whose entire content is gated by one root toggle — swapped in for the group's own concept icon while that toggle is off, so the header still reads as inactive without depending on every concept having a matching "-off"/"-outline" icon variant (most MDI icons don't). */
const GROUP_OFF_ICON = "mdi:circle-off-outline";

@customElement("mos-detail-card-editor")
export class MosDetailCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: MosDetailCardConfig;

  /** Populated live from the device registry — this editor's own first need for it; the card itself is handed a `device_id` directly and never enumerates a server's children. */
  @state() private _devices: DeviceRegistryEntry[] = [];

  /**
   * The server → kind cascade's own current picks. Editor-only UI state,
   * never persisted — the saved config still only ever has `device_id`
   * and (rarely) `kind`, exactly as before. Seeded from the *existing*
   * `device_id` once the registry loads (see `_maybeSeedPending`), so
   * editing an already-configured card opens with server/kind correctly
   * pre-selected rather than blank.
   */
  @state() private _pendingServer?: string;
  @state() private _pendingKind?: DetailKindId;

  /** Which `device_id` `_pendingServer`/`_pendingKind` were last seeded from — re-seed only when `device_id` changes *externally* (e.g. hand-edited in YAML), never on every render, or seeding would fight the user's own in-progress server/kind picks before they've chosen a device. */
  private _seededForDeviceId?: string;

  private _unsubscribe?: UnsubscribeFunc;

  public setConfig(config: MosDetailCardConfig): void {
    this._config = config;
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
    this._maybeSeedPending();
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
    this._unsubscribe = subscribeDeviceRegistry(this.hass.connection as any, (devices) => {
      this._devices = devices;
    });
  }

  private _maybeSeedPending(): void {
    const deviceId = this._config?.device_id;
    if (!deviceId || this._devices.length === 0 || this._seededForDeviceId === deviceId) {
      return;
    }
    this._seededForDeviceId = deviceId;
    const device = findDeviceById(this._devices, deviceId);
    if (!device) {
      return;
    }
    const kind: DetailKindId | undefined =
      this._config.kind ??
      findKindByModelId(device.model_id)?.id ??
      (isServerDevice(this._devices, deviceId) ? "server" : undefined);
    this._pendingKind = kind;
    this._pendingServer = kind === "server" ? deviceId : (device.via_device_id ?? undefined);
  }

  private _serverOptions(): SelectOption[] {
    return findServerDevices(this._devices).map((device) => ({
      value: device.id,
      label: device.name_by_user || device.name || device.id,
    }));
  }

  /** Devices under `serverId` matching `kind`, for the third cascade step — empty for `"server"`, which has no third step at all (selecting that kind IS selecting the device, see `_valueChanged`). */
  private _deviceOptions(serverId: string, kind: DetailKindId): SelectOption[] {
    if (kind === "pool") {
      return selectPoolDevices(this._devices, serverId).map((device) => ({
        value: device.id,
        label: poolDisplayName(device),
      }));
    }
    if (kind === "disk") {
      return selectDiskDevices(this._devices, serverId).map((device) => ({
        value: device.id,
        label: diskDisplayName(device),
      }));
    }
    if (kind === "server") {
      return [];
    }
    const modelId = DETAIL_KIND_DEFS[kind].modelId;
    if (!modelId) {
      return [];
    }
    return selectGuestDevicesOfKind(this._devices, modelId, serverId).map((device) => ({
      value: device.id,
      label: device.name_by_user || device.name || device.id,
    }));
  }

  /**
   * Grouped into expandable sections (config stays flat — every group uses
   * `flatten: true`), same pattern as `mos-server-summary-card`'s editor.
   * Two things keep this from turning back into a wall of always-visible
   * fields as more kinds/options are added:
   * - Kind-specific groups (Compose/Server/Pool) only appear once the
   *   cascade's own `_pendingKind` actually matches — not "always shown,
   *   no-op otherwise" like the pre-restructure version of this file.
   * - A group whose entire content descends from one root toggle
   *   (History, Pool Disks) swaps its header icon to a generic "off" glyph
   *   while that toggle is off, so it visibly reads as inactive without
   *   expanding it — the toggle itself and the expand chevron stay
   *   reachable either way, only the (now-empty) sub-options are removed
   *   from the schema, same conditional-inclusion technique used
   *   throughout this repo's editors.
   */
  private _schema(): Schema[] {
    const kind = this._pendingKind;
    const isGuest = kind === "docker" || kind === "compose" || kind === "lxc" || kind === "vm";
    const isCompose = kind === "compose";
    const isServer = kind === "server";
    const isPool = kind === "pool";
    const isDisk = kind === "disk";
    const ready = !!this._pendingServer && !!kind;

    const showHistory = this._config?.show_history ?? true;
    const showContainers = this._config?.show_containers ?? true;
    const showPoolDisks = this._config?.show_pool_disks ?? true;

    return [
      {
        name: "_server",
        required: true,
        selector: { select: { mode: "dropdown", options: this._serverOptions() } },
      },
      {
        name: "_device_kind",
        required: true,
        selector: { select: { mode: "dropdown", options: KIND_OPTIONS } },
      },
      // No third step once "Server" is picked — the server device carries
      // no model_id of its own, so it can't be found via a device list
      // the way every other kind's device is; selecting the kind already
      // fully identifies the device (see _valueChanged).
      ...(ready && !isServer
        ? [
            {
              name: "device_id",
              required: true,
              selector: { select: { mode: "dropdown", options: this._deviceOptions(this._pendingServer!, kind!) } },
            },
          ]
        : []),
      { name: "title", selector: { text: {} } },
      // show_identity/show_status are no-ops for the pool kind (see
      // mos-detail-card.ts's _renderCard) — its dedicated layout folds
      // both into its own header instead.
      ...(!isPool ? [{ name: "show_identity", selector: { boolean: {} } }] : []),
      { name: "show_stats", selector: { boolean: {} } },
      ...(!isPool ? [{ name: "show_status", selector: { boolean: {} } }] : []),
      // Guest kinds only — no power toggle exists for pool/disk/server.
      ...(isGuest ? [{ name: "show_power_toggle", selector: { boolean: {} } }] : []),
      // Disk has no history-capable metric at all (see docs) — the whole
      // group is skipped rather than shown empty/no-op.
      ...(!isDisk
        ? [
            {
              type: "expandable",
              name: "history_group",
              title: "History",
              icon: showHistory ? "mdi:chart-line" : GROUP_OFF_ICON,
              flatten: true,
              schema: [
                { name: "show_history", selector: { boolean: {} } },
                ...(showHistory
                  ? [
                      { name: "history_hours", selector: { number: { mode: "box", min: 1, max: 24, step: 1 } } },
                      { name: "sparkline_show_value_scale", selector: { boolean: {} } },
                      { name: "sparkline_show_time_scale", selector: { boolean: {} } },
                    ]
                  : []),
              ],
            },
          ]
        : []),
      ...(isCompose
        ? [
            {
              type: "expandable",
              name: "compose_group",
              title: "Compose",
              icon: "mdi:layers-triple",
              flatten: true,
              schema: [
                {
                  name: "container_count_style",
                  selector: { select: { mode: "dropdown", options: CONTAINER_COUNT_STYLE_OPTIONS } },
                },
                { name: "show_containers", selector: { boolean: {} } },
                ...(showContainers
                  ? [
                      {
                        name: "containers_list_style",
                        selector: { select: { mode: "dropdown", options: CONTAINERS_LIST_STYLE_OPTIONS } },
                      },
                    ]
                  : []),
              ],
            },
          ]
        : []),
      ...(isServer
        ? [
            {
              type: "expandable",
              name: "server_group",
              title: "Server",
              icon: "mdi:thermometer",
              flatten: true,
              schema: [
                {
                  name: "cpu_temp_detail_style",
                  selector: { select: { mode: "dropdown", options: CPU_TEMP_DETAIL_STYLE_OPTIONS } },
                },
                { name: "show_hardware_sensors", selector: { boolean: {} } },
              ],
            },
          ]
        : []),
      ...(isPool
        ? [
            {
              type: "expandable",
              name: "pool_group",
              title: "Pool disks",
              icon: showPoolDisks ? "mdi:harddisk" : GROUP_OFF_ICON,
              flatten: true,
              schema: [
                { name: "show_pool_disks", selector: { boolean: {} } },
                ...(showPoolDisks
                  ? [
                      {
                        name: "pool_disk_layout",
                        selector: { select: { mode: "dropdown", options: POOL_DISK_LAYOUT_OPTIONS } },
                      },
                      {
                        name: "pool_disk_value_style",
                        selector: { select: { mode: "dropdown", options: POOL_DISK_VALUE_STYLE_OPTIONS } },
                      },
                      {
                        name: "pool_disk_attributes",
                        selector: { select: { multiple: true, mode: "list", options: POOL_DISK_ATTRIBUTE_OPTIONS } },
                      },
                    ]
                  : []),
              ],
            },
          ]
        : []),
      {
        type: "expandable",
        name: "interactions_group",
        title: "Interactions",
        icon: "mdi:gesture-tap-button",
        flatten: true,
        schema: [
          { name: "tap_action", selector: { ui_action: {} } },
          { name: "hold_action", selector: { ui_action: {} } },
          { name: "double_tap_action", selector: { ui_action: {} } },
        ],
      },
      {
        type: "expandable",
        name: "advanced_group",
        title: "Advanced",
        icon: "mdi:cog-outline",
        flatten: true,
        schema: [{ name: "kind", selector: { select: { mode: "dropdown", options: KIND_OPTIONS } } }],
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
   * `?? true` fallbacks in mos-detail-card.ts, or the editor would show a
   * toggle's default state while the card behaves differently.
   * `_server`/`_device_kind` come from local state, not `config` — they're
   * never persisted (see the fields' own comments).
   */
  private _data(config: MosDetailCardConfig): Record<string, unknown> {
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
      show_pool_disks: true,
      pool_disk_layout: "rows",
      pool_disk_value_style: "bar",
      pool_disk_attributes: ["model", "size"],
      ...config,
      _server: this._pendingServer,
      _device_kind: this._pendingKind,
    };
  }

  private _computeLabel = (schema: Schema): string => {
    const localizeKey = ACTION_LOCALIZE_KEYS[schema.name];
    if (localizeKey) {
      return this.hass.localize(localizeKey) || schema.name;
    }
    return schema.title ?? FIELD_LABELS[schema.name] ?? schema.name;
  };

  /**
   * `_server`/`_device_kind` are virtual cascade-helper fields (see their
   * own comments) — split out of the emitted value before it's persisted,
   * so they never leak into saved YAML. Changing either clears `device_id`
   * (the previously-selected device almost certainly doesn't belong to the
   * new server/kind) except for the `"server"` kind, which sets `device_id`
   * straight to the chosen server's own id instead of leaving it empty —
   * see `_deviceOptions`'s comment for why that kind has no third step.
   */
  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const { _server, _device_kind, ...rest } = ev.detail.value as Record<string, unknown> & {
      _server?: string;
      _device_kind?: DetailKindId;
    };

    const nextConfig: MosDetailCardConfig = { ...this._config, ...(rest as Partial<MosDetailCardConfig>) };

    if (_server !== this._pendingServer || _device_kind !== this._pendingKind) {
      this._pendingServer = _server;
      this._pendingKind = _device_kind;
      delete nextConfig.device_id;
      if (_device_kind === "server" && _server) {
        nextConfig.device_id = _server;
      }
    }

    this._config = nextConfig;
    fireEvent(this, "config-changed", { config: nextConfig });
  }

  static styles = css`
    ha-form {
      display: block;
    }
  `;
}
