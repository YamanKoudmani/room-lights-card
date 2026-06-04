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
          .includeDomains=${['light']}
          allow-custom-entity
          .label=${'Light'}
          @value-changed=${(ev: Event) => this._entityChanged(index, ev)}
        ></ha-entity-picker>
        <ha-select
          class="columns-select"
          .value=${String(e.columns ?? 1)}
          .label=${'Width'}
          @selected=${(ev: Event) => this._columnsChanged(index, ev)}
          @value-changed=${(ev: Event) => this._columnsChanged(index, ev)}
        >
          <mwc-list-item value="1">Full</mwc-list-item>
          <mwc-list-item value="2">Half</mwc-list-item>
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

  private _columnsChanged(index: number, ev: Event): void {
    ev.stopPropagation();
    if (!this._config) return;
    const target = ev.target as HTMLElement & { value?: string };
    const raw = target.value ?? '1';
    const columns: 1 | 2 = raw === '2' ? 2 : 1;
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
