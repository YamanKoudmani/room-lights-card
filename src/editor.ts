import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from 'custom-card-helpers';
import { fireEvent } from 'custom-card-helpers';
import type { RoomLightsCardConfig, LightEntityConfig } from './types';
import { normalizeLightConfig } from './const';

// Subset of HA's HaFormSchema covering everything we use. The full
// type lives in HA's frontend and isn't exported via custom-card-helpers.
interface HaFormSchemaItem {
  name: string;
  type?: string;
  schema?: HaFormSchemaItem[];
  selector?: Record<string, unknown>;
  context?: Record<string, unknown>;
}
type HaFormSchema = HaFormSchemaItem[];

@customElement('room-lights-card-editor')
export class RoomLightsCardEditor extends LitElement {
  @property({ attribute: false })
  public hass?: HomeAssistant;

  @state()
  private _config?: RoomLightsCardConfig;

  setConfig(config: RoomLightsCardConfig): void {
    const entities = Array.isArray(config.entities) ? config.entities : [];
    this._config = {
      ...config,
      name: config.name ?? '',
      entities: entities.map((e) => normalizeLightConfig(e)),
    };
  }

  private get _roomOff(): string {
    return typeof this._config?.room_off === 'string' ? this._config.room_off : '';
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) return html``;
    const cfg = this._config;

    const rootSchema: HaFormSchema = [
      { name: 'name', selector: { text: {} } },
      {
        name: 'room_off',
        selector: { entity: { domain: ['light', 'group', 'switch'] } },
      },
    ];

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ name: cfg.name, room_off: this._roomOff }}
        .schema=${rootSchema}
        .computeLabel=${this._computeRootLabel}
        .computeHelper=${this._computeRootHelper}
        @value-changed=${this._rootFormChanged}
      ></ha-form>

      <div class="entities-section">
        <div class="section-title">Entities</div>
        ${cfg.entities.map((e, i) => this._renderEntitySection(e, i))}
        <mwc-button
          class="add-btn"
          raised
          @click=${this._addEntity}
        >
          <ha-icon icon="mdi:plus" slot="graphic"></ha-icon>
          Add entity
        </mwc-button>
      </div>
    `;
  }

  private _renderEntitySection(
    e: LightEntityConfig,
    index: number,
  ): TemplateResult {
    // `type: "grid"` puts its child fields side-by-side. `name: ""` with
    // the default `flatten` keeps the fields at the form-data root so
    // we can read `entity`, `columns`, `name`, `icon` directly from
    // `ev.detail.value` without nesting.
    const entitySchema: HaFormSchema = [
      {
        type: 'grid',
        name: '',
        schema: [
          {
            name: 'entity',
            selector: { entity: { domain: ['light', 'switch'] } },
          },
          {
            name: 'columns',
            selector: {
              select: {
                options: [
                  { value: 1, label: 'Full' },
                  { value: 2, label: 'Half' },
                ],
                mode: 'dropdown',
              },
            },
          },
        ],
      },
      {
        type: 'grid',
        name: '',
        schema: [
          { name: 'name', selector: { text: {} } },
          {
            name: 'icon',
            selector: { icon: {} },
            // Hint the icon picker with the selected entity's icon so
            // the user starts from a sensible default.
            context: { icon_entity: 'entity' },
          },
        ],
      },
    ];

    return html`
      <div class="entity-section">
        <ha-form
          .hass=${this.hass}
          .data=${{
            entity: e.entity,
            columns: e.columns,
            name: e.name ?? '',
            icon: e.icon ?? '',
          }}
          .schema=${entitySchema}
          .computeLabel=${this._computeEntityLabel}
          @value-changed=${(ev: CustomEvent) => this._entityFormChanged(index, ev)}
        ></ha-form>
        <div class="entity-actions">
          <ha-icon-button
            class="remove-btn"
            .label=${'Remove entity'}
            @click=${() => this._removeEntity(index)}
          >
            <ha-icon icon="mdi:delete-outline"></ha-icon>
          </ha-icon-button>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Form change handlers
  // ---------------------------------------------------------------------------

  private _rootFormChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config) return;
    const value = (
      ev.detail as { value: { name?: string; room_off?: string } }
    ).value;
    const newConfig: RoomLightsCardConfig = {
      ...this._config,
      name: value.name ?? '',
      // Drop room_off entirely when the picker is cleared so the YAML
      // doesn't carry a useless `room_off: ''` line.
      room_off:
        value.room_off && value.room_off.length > 0
          ? value.room_off
          : undefined,
    };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _entityFormChanged(index: number, ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config) return;
    const value = (
      ev.detail as {
        value: {
          entity: string;
          columns: number | string;
          name: string;
          icon: string;
        };
      }
    ).value;
    const updated: LightEntityConfig = {
      entity: value.entity,
      columns: Number(value.columns) === 2 ? 2 : 1,
    };
    if (value.name && value.name.length > 0) updated.name = value.name;
    if (value.icon && value.icon.length > 0) updated.icon = value.icon;
    const entities = [...this._config.entities];
    entities[index] = updated;
    const newConfig: RoomLightsCardConfig = { ...this._config, entities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  // ---------------------------------------------------------------------------
  // Label / helper translations
  // ---------------------------------------------------------------------------

  private _computeRootLabel = (schema: HaFormSchemaItem): string => {
    if (schema.name === 'name') return 'Card name';
    if (schema.name === 'room_off') return 'Room off target (optional)';
    return '';
  };

  private _computeRootHelper = (schema: HaFormSchemaItem): string => {
    if (schema.name === 'room_off') {
      return 'Header tap toggles this entity instead of the tiles. Use a HA light group (e.g. group.living_room_lights) to represent the whole room.';
    }
    return '';
  };

  private _computeEntityLabel = (schema: HaFormSchemaItem): string => {
    if (schema.name === 'entity') return 'Light / Switch';
    if (schema.name === 'columns') return 'Tile width';
    if (schema.name === 'name') return 'Display name (optional)';
    if (schema.name === 'icon') return 'Icon (optional)';
    return '';
  };

  // ---------------------------------------------------------------------------
  // Entity list management
  // ---------------------------------------------------------------------------

  private _addEntity = (): void => {
    if (!this._config) return;
    const entities = [
      ...this._config.entities,
      { entity: '', columns: 1 as 1 | 2 },
    ];
    const newConfig: RoomLightsCardConfig = { ...this._config, entities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  };

  private _removeEntity(index: number): void {
    if (!this._config) return;
    const entities = this._config.entities.filter((_, i) => i !== index);
    const newConfig: RoomLightsCardConfig = { ...this._config, entities };
    this._config = newConfig;
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  // ---------------------------------------------------------------------------
  // Styles: only the section wrapper + trash button position. All
  // input styling is delegated to <ha-form> for native theming.
  // ---------------------------------------------------------------------------

  static styles = css`
    :host {
      display: block;
    }
    .entities-section {
      margin-top: 16px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--primary-text-color);
      margin: 16px 0 8px;
    }
    .entity-section {
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .entity-actions {
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.08));
      margin-top: 8px;
      padding-top: 4px;
    }
    .remove-btn {
      --mdc-icon-button-size: 36px;
      color: var(--error-color, #b71c1c);
    }
    .add-btn {
      --mdc-theme-primary: var(--primary-color);
      align-self: flex-start;
      margin-top: 4px;
    }
  `;
}
