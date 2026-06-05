import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fireEvent, type HomeAssistant } from 'custom-card-helpers';
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
      icon: config.icon ?? '',
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
      { name: 'icon', selector: { icon: {} } },
      {
        name: 'room_off',
        selector: { entity: { domain: ['light', 'group', 'switch'] } },
      },
      { name: 'compact', selector: { boolean: {} } },
    ];

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{
          name: cfg.name,
          icon: cfg.icon ?? '',
          room_off: this._roomOff,
          compact: cfg.compact === true,
        }}
        .schema=${rootSchema}
        .computeLabel=${this._computeRootLabel}
        .computeHelper=${this._computeRootHelper}
        @value-changed=${this._rootFormChanged}
      ></ha-form>

      <div class="entities-section">
        <div class="section-title">Entities</div>
        ${cfg.entities.map((e, i) => this._renderEntitySection(e, i))}
        <ha-button
          class="add-btn"
          @click=${this._addEntity}
        >
          <ha-icon icon="mdi:plus" slot="icon"></ha-icon>
          Add entity
        </ha-button>
      </div>
    `;
  }

  private _renderEntitySection(
    e: LightEntityConfig,
    index: number,
  ): TemplateResult {
    // Lay out fields to prevent vertical misalignment:
    // 1. Entity selector (stacks icon + name + area and takes up full width).
    // 2. Display name (takes up full width).
    // 3. Tile width & Custom Icon (side-by-side). Both use floating labels
    //    so they align perfectly on the same row.
    const entitySchema: HaFormSchema = [
      {
        name: 'entity',
        selector: { entity: { domain: ['light', 'switch'] } },
      },
      { name: 'name', selector: { text: {} } },
      {
        type: 'grid',
        name: '',
        schema: [
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

    const total = this._config?.entities.length ?? 0;

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
            .label=${'Move up'}
            .disabled=${index === 0}
            @click=${() => this._moveEntity(index, -1)}
          >
            <ha-icon icon="mdi:arrow-up"></ha-icon>
          </ha-icon-button>
          <ha-icon-button
            .label=${'Move down'}
            .disabled=${index === total - 1}
            @click=${() => this._moveEntity(index, 1)}
          >
            <ha-icon icon="mdi:arrow-down"></ha-icon>
          </ha-icon-button>
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
      ev.detail as {
        value: { name?: string; icon?: string; room_off?: string; compact?: boolean };
      }
    ).value;
    const newConfig: RoomLightsCardConfig = {
      ...this._config,
      name: value.name ?? '',
      // Drop icon entirely when cleared
      icon:
        value.icon && value.icon.trim().length > 0
          ? value.icon.trim()
          : undefined,
      // Drop room_off entirely when the picker is cleared so the YAML
      // doesn't carry a useless `room_off: ''` line.
      room_off:
        value.room_off && value.room_off.length > 0
          ? value.room_off
          : undefined,
      // Drop compact entirely when off so the YAML stays clean and
      // `compact: false` doesn't appear on every config.
      compact: value.compact === true ? true : undefined,
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
    if (schema.name === 'icon') return 'Card icon (optional)';
    if (schema.name === 'room_off') return 'Room off target (optional)';
    if (schema.name === 'compact') return 'Compact mode';
    return '';
  };

  private _computeRootHelper = (schema: HaFormSchemaItem): string => {
    if (schema.name === 'icon') {
      return 'When set, this icon always shows in the header. When left empty, the header automatically shows mdi:lightbulb-group-off (all off) or mdi:lightbulb-group (any on).';
    }
    if (schema.name === 'room_off') {
      return 'Header tap toggles this entity instead of the tiles. Use a HA light group (e.g. group.living_room_lights) to represent the whole room.';
    }
    if (schema.name === 'compact') {
      return 'Removes the gap between tiles and tightens padding. Useful when you have many entities and want a denser layout.';
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

  private _moveEntity(index: number, direction: -1 | 1): void {
    if (!this._config) return;
    const target = index + direction;
    const entities = this._config.entities;
    if (target < 0 || target >= entities.length) return;
    // Copy before swapping so we never mutate the previous config
    // object (which would confuse the diff + undo in the HA editor).
    const next = [...entities];
    [next[index], next[target]] = [next[target], next[index]];
    const newConfig: RoomLightsCardConfig = { ...this._config, entities: next };
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
    .entity-actions ha-icon-button {
      --mdc-icon-button-size: 36px;
      color: var(--secondary-text-color);
    }
    .remove-btn {
      color: var(--error-color, #b71c1c);
    }
    .add-btn {
      /* ha-button is HA-themed end-to-end (it picks up --primary-color,
         --card-background-color, etc. internally) so it correctly
         inherits transparency in glassmorphism themes. The previous
         <mwc-button raised> used Material's own --mdc-theme-primary
         fallback (opaque blue) and didn't honor translucent themes. */
      align-self: flex-start;
      margin-top: 4px;
    }
  `;
}
