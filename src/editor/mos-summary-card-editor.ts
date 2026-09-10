import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireEvent } from "custom-card-helpers";
import type { HomeAssistant, LovelaceCardEditor } from "custom-card-helpers";
import { KIND_IDS, type MosKindId, type MosSummaryCardConfig } from "../types";
import { KIND_DEFAULTS } from "../kinds";

// Loose typing: HA's ha-form schema types aren't published as a standalone
// package, and this editor only borrows the <ha-form> element that ships
// with the Home Assistant frontend at runtime (a common technique used by
// most custom cards) rather than bundling it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = any;

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  server: "MOS server",
  cpu_entity: "CPU entity",
  memory_entity: "Memory entity",
  temperature_entity: "Temperature entity",
  state_entities: "Running / health entities",
  stat_entities: "Stat entities (summed)",
  advanced: "Advanced",
  name: "Name override",
  icon: "Icon override",
  stat_label: "Stat label override",
  stat_icon: "Stat icon override",
};

function kindSchema(kindId: MosKindId): Schema {
  const defaults = KIND_DEFAULTS[kindId];
  const stateDomains = defaults.mode === "running" ? ["switch", "binary_sensor"] : ["binary_sensor"];
  return {
    name: kindId,
    type: "expandable",
    title: defaults.name,
    icon: defaults.icon,
    schema: [
      {
        name: "state_entities",
        selector: { entity: { multiple: true, domain: stateDomains } },
      },
      {
        name: "stat_entities",
        selector: { entity: { multiple: true, domain: "sensor" } },
      },
      {
        name: "advanced",
        type: "expandable",
        title: "Advanced",
        flatten: true,
        schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
          { name: "stat_label", selector: { text: {} } },
          { name: "stat_icon", selector: { icon: {} } },
        ],
      },
    ],
  };
}

const SCHEMA: Schema[] = [
  { name: "title", selector: { text: {} } },
  { name: "server", selector: { device: { filter: { integration: "mos" } } } },
  { name: "cpu_entity", selector: { entity: { domain: "sensor" } } },
  { name: "memory_entity", selector: { entity: { domain: "sensor" } } },
  { name: "temperature_entity", selector: { entity: { domain: "sensor" } } },
  ...KIND_IDS.map(kindSchema),
];

@customElement("mos-summary-card-editor")
export class MosSummaryCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config!: MosSummaryCardConfig;

  public setConfig(config: MosSummaryCardConfig): void {
    this._config = config;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${SCHEMA}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _computeLabel = (schema: Schema): string => {
    if (schema.type === "expandable" && (KIND_IDS as readonly string[]).includes(schema.name)) {
      return KIND_DEFAULTS[schema.name as MosKindId].name;
    }
    return FIELD_LABELS[schema.name] ?? schema.name;
  };

  private _valueChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const newConfig: MosSummaryCardConfig = {
      ...this._config,
      ...ev.detail.value,
    };
    fireEvent(this, "config-changed", { config: newConfig });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "mos-summary-card-editor": MosSummaryCardEditor;
  }
}
