import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from 'custom-card-helpers';
import { fireEvent } from 'custom-card-helpers';
import type { RoomLightsCardConfig, LightEntityConfig } from './types';

@customElement('room-lights-card-editor')
export class RoomLightsCardEditor extends LitElement {
  @property({ attribute: false })
  public hass?: HomeAssistant;

  @state()
  private _config?: RoomLightsCardConfig;

  setConfig(config: RoomLightsCardConfig): void {
    // Tolerate partial/missing fields so the editor can render
    const entities = Array.isArray(config.entities) ? config.entities : [];
    this._config = {
      ...config,
      name: config.name ?? '',
      entities: entities.map((e) => ({
        entity: e?.entity ?? '',
        columns: e?.columns === 2 ? 2 : 1,
      })),
    };
  }

  /** Normalise room_off: treat undefined OR empty string as "not set". */
  private get _roomOff(): string {
    const v = this._config?.room_off;
    return typeof v === 'string' ? v : '';
  }

  protected render(): TemplateResult {
    if (!this._config) return html``;
    const cfg = this._config;

    return html`
      <div class="editor">
        <div class="section">
          <div class="section-title">Card</div>
          <ha-textfield
            label="Name"
            .value=${cfg.name}
            data-config-value="name"
            @input=${this._valueChanged}
          ></ha-textfield>
          <ha-entity-picker
            class="room-off-picker"
            .hass=${this.hass}
            .value=${this._roomOff}
            .includeDomains=${['light', 'group', 'switch']}
            allow-custom-entity
            .label=${'Room off target (optional)'}
            .helper=${'Header tap toggles this entity instead of the tiles. Use a HA light group (e.g. group.living_room_lights) to represent the whole room.'}
            @value-changed=${this._roomOffChanged}
          ></ha-entity-picker>
        </div>

        <div class="section">
          <div class="section-title">Lights</div>
          ${cfg.entities.length === 0
            ? html`<div class="empty">No lights configured yet.</div>`
            : cfg.entities.map((e, i) => this._renderRow(e, i))}
          <mwc-button
            class="add-btn"
            raised
            label="Add light"
            @click=${this._addEntity}
          ></mwc-button>
        </div>
      </div>
    `;
  }

  private _renderRow(e: LightEntityConfig, index: number): TemplateResult {
    return html`
      <div class="row">
        <ha-entity-picker
          class="entity-picker"
          .hass=${this.hass}
          .value=${e.entity}
          .includeDomains=${['light', 'switch']}
          allow-custom-entity
          .label=${'Light / Switch'}
          @value-changed=${(ev: Event) => this._entityChanged(index, ev)}
        ></ha-entity-picker>
        <ha-select
          class="columns-select"
          .label=${'Width'}
          .value=${String(e.columns)}
          .selectedIndex=${e.columns === 2 ? 1 : 0}
          @value-changed=${(ev: CustomEvent<{ value: string | number }>) =>
            this._columnsChanged(index, ev)}
        >
          <ha-list-item
            .value=${'1'}
            ?selected=${e.columns === 1}
            @click=${(ev: Event) => this._columnsPicked(index, 1, ev)}
            >Full</ha-list-item
          >
          <ha-list-item
            .value=${'2'}
            ?selected=${e.columns === 2}
            @click=${(ev: Event) => this._columnsPicked(index, 2, ev)}
            >Half</ha-list-item
          >
        </ha-select>
        <mwc-icon-button
          class="remove-btn"
          label="Remove"
          @click=${() => this._removeEntity(index)}
        >
          <ha-icon icon="mdi:delete-outline"></ha-icon>
        </mwc-icon-button>
      </div>
    `;
  }

  private _valueChanged(ev: Event): void {
    ev.stopPropagation();
    if (!this._config) return;
    const target = ev.target as HTMLElement & { value?: string };
    const key = target.dataset.configValue as keyof RoomLightsCardConfig | undefined;
    if (!key) return;
    const value = target.value ?? '';
    const newConfig: RoomLightsCardConfig = {
      ...this._config,
      [key]: value,
    };
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _entityChanged(index: number, ev: Event): void {
    ev.stopPropagation();
    if (!this._config) return;
    const detail = (ev as CustomEvent<{ value: string }>).detail;
    const value = detail?.value ?? '';
    const entities = [...this._config.entities];
    entities[index] = { ...entities[index], entity: value };
    const newConfig: RoomLightsCardConfig = { ...this._config, entities };
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _roomOffChanged = (ev: Event): void => {
    ev.stopPropagation();
    if (!this._config) return;
    const detail = (ev as CustomEvent<{ value: string }>).detail;
    const value = (detail?.value ?? '').trim();
    // Drop the field entirely when the picker is cleared so the YAML
    // doesn't carry a useless `room_off: ''` line.
    const newConfig: RoomLightsCardConfig = {
      ...this._config,
      room_off: value.length > 0 ? value : undefined,
    };
    fireEvent(this, 'config-changed', { config: newConfig });
  };

  private _columnsChanged(
    index: number,
    ev: CustomEvent<{ value: string | number | undefined }>,
  ): void {
    ev.stopPropagation();
    if (!this._config) return;
    const raw = ev.detail?.value;
    const columns: 1 | 2 = String(raw) === '2' ? 2 : 1;
    const entities = [...this._config.entities];
    entities[index] = { ...entities[index], columns };
    const newConfig: RoomLightsCardConfig = { ...this._config, entities };
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  /**
   * Defensive backup: if the host's `value-changed` doesn't fire (some
   * HA versions swallow it), we still get a click on the ha-list-item
   * and can update the config directly.
   */
  private _columnsPicked(index: number, columns: 1 | 2, ev: Event): void {
    ev.stopPropagation();
    if (!this._config) return;
    // Don't double-fire if the value is already correct.
    if (this._config.entities[index]?.columns === columns) return;
    const entities = [...this._config.entities];
    entities[index] = { ...entities[index], columns };
    const newConfig: RoomLightsCardConfig = { ...this._config, entities };
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _addEntity = (): void => {
    if (!this._config) return;
    const entities = [
      ...this._config.entities,
      { entity: '', columns: 1 as 1 | 2 },
    ];
    const newConfig: RoomLightsCardConfig = { ...this._config, entities };
    fireEvent(this, 'config-changed', { config: newConfig });
  };

  private _removeEntity(index: number): void {
    if (!this._config) return;
    const entities = this._config.entities.filter((_, i) => i !== index);
    const newConfig: RoomLightsCardConfig = { ...this._config, entities };
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  static styles = css`
    :host {
      display: block;
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 12px 0;
    }
    .section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--divider-color, rgba(0, 0, 0, 0.1));
    }
    .section:last-of-type {
      border-bottom: none;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--primary-text-color);
      margin-bottom: 4px;
    }
    .empty {
      font-size: 13px;
      color: var(--secondary-text-color);
      padding: 8px 0;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 110px 40px;
      gap: 8px;
      align-items: center;
    }
    .entity-picker {
      width: 100%;
    }
    .room-off-picker {
      width: 100%;
    }
    .columns-select {
      width: 100%;
    }
    .remove-btn {
      --mdc-icon-button-size: 40px;
      color: var(--error-color, #b71c1c);
    }
    .add-btn {
      --mdc-theme-primary: var(--primary-color);
      align-self: flex-start;
      margin-top: 4px;
    }
  `;
}
