import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from 'custom-card-helpers';
import { fireEvent } from 'custom-card-helpers';
import type { RoomLightsCardConfig, LightEntityConfig } from './types';
import { normalizeLightConfig } from './const';

@customElement('room-lights-card-editor')
export class RoomLightsCardEditor extends LitElement {
  @property({ attribute: false })
  public hass?: HomeAssistant;

  @state()
  private _config?: RoomLightsCardConfig;

  setConfig(config: RoomLightsCardConfig): void {
    // Tolerate partial/missing fields so the editor can render.
    // `normalizeLightConfig` preserves the per-entity `name` and
    // `icon` overrides (omits them when blank instead of writing
    // empty strings, and trims whitespace).
    const entities = Array.isArray(config.entities) ? config.entities : [];
    this._config = {
      ...config,
      name: config.name ?? '',
      entities: entities.map((e) => normalizeLightConfig(e)),
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
          <input
            type="text"
            class="card-name-field"
            .value=${cfg.name}
            placeholder="Card name"
            autocomplete="off"
            data-config-value="name"
            @input=${this._valueChanged}
          />
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
            @click=${this._addEntity}
          >
            <ha-icon icon="mdi:plus" slot="graphic"></ha-icon>
            Add entity
          </mwc-button>
        </div>
      </div>
    `;
  }

  private _renderRow(e: LightEntityConfig, index: number): TemplateResult {
    const hasEntity = typeof e.entity === 'string' && e.entity.length > 0;
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
        <div class="width-toggle" role="group" aria-label="Tile width">
          <button
            type="button"
            class=${e.columns === 1 ? 'selected' : ''}
            aria-pressed=${e.columns === 1 ? 'true' : 'false'}
            @click=${(ev: Event) => this._columnsPicked(index, 1, ev)}
          >
            Full
          </button>
          <button
            type="button"
            class=${e.columns === 2 ? 'selected' : ''}
            aria-pressed=${e.columns === 2 ? 'true' : 'false'}
            @click=${(ev: Event) => this._columnsPicked(index, 2, ev)}
          >
            Half
          </button>
        </div>
        <mwc-icon-button
          class="remove-btn"
          label="Remove"
          @click=${() => this._removeEntity(index)}
        >
          <ha-icon icon="mdi:delete-outline"></ha-icon>
        </mwc-icon-button>
      </div>
      ${hasEntity
        ? html`
            <div class="row-overrides">
              <input
                type="text"
                class="name-field"
                .value=${e.name ?? ''}
                placeholder="Display name (optional)"
                autocomplete="off"
                data-config-index=${index}
                data-config-key="name"
                @input=${this._overrideChanged}
              />
              <ha-icon-picker
                class="icon-picker"
                .hass=${this.hass}
                .value=${e.icon ?? ''}
                .label=${'Icon (optional)'}
                .placeholder=${'Defaults to entity icon'}
                data-config-index=${index}
                data-config-key="icon"
                @value-changed=${this._iconPicked}
              ></ha-icon-picker>
            </div>
          `
        : ''}
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
    // Clearing the entity also clears any stale custom name/icon
    // overrides so a re-picked entity doesn't inherit them.
    if (value.length === 0) {
      entities[index] = { entity: '', columns: entities[index].columns };
    }
    const newConfig: RoomLightsCardConfig = { ...this._config, entities };
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _overrideChanged = (ev: Event): void => {
    ev.stopPropagation();
    if (!this._config) return;
    const target = ev.target as HTMLElement & {
      value?: string;
      dataset?: { configIndex?: string; configKey?: string };
    };
    const index = Number(target.dataset?.configIndex);
    const key = target.dataset?.configKey as 'name' | 'icon' | undefined;
    if (Number.isNaN(index) || !key) return;
    // Prefer detail.value (works for ha-icon-picker value-changed and
    // any custom-event source). Fall back to target.value for the
    // ha-textfield @input event, which has no detail.
    const detail = (ev as CustomEvent<{ value?: string }>).detail;
    const raw = (
      typeof detail?.value === 'string' ? detail.value : target.value ?? ''
    ).trim();
    const entities = [...this._config.entities];
    const current = entities[index];
    if (!current) return;
    // Build the updated entity; drop the override entirely when blank
    // so the YAML doesn't carry a useless `name: ''` line.
    const next: LightEntityConfig = { ...current };
    if (raw.length === 0) {
      delete (next as Partial<LightEntityConfig>)[key];
    } else {
      (next as Partial<LightEntityConfig>)[key] = raw;
    }
    entities[index] = next;
    this._config = { ...this._config, entities };
    fireEvent(this, 'config-changed', { config: this._config });
  };

  private _iconPicked = (ev: Event): void => {
    // ha-icon-picker fires value-changed with detail.value (same
    // shape as ha-entity-picker). Reuse the same write path.
    this._overrideChanged(ev);
  };

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

  /**
   * Direct handler for the Full/Half toggle buttons. Replaces the
   * previous ha-select control which was unreliable across HA frontend
   * versions (either the trigger rendered the value instead of the
   * label, or value-changed didn't fire on click).
   */
  private _columnsPicked(index: number, columns: 1 | 2, ev: Event): void {
    ev.stopPropagation();
    if (!this._config) return;
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
    .row-overrides {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 6px;
    }
    /* Native <input> styled to match the HA theme. We use native
       inputs (not <ha-textfield>) because the ha-textfield custom
       element does not render in some HA frontend versions (the host
       element collapses to zero size with no visible content). Native
       inputs are guaranteed to render and inherit HA CSS variables. */
    .card-name-field,
    .name-field {
      flex: 1 1 0;
      min-width: 0;
      width: 100%;
      height: 40px;
      padding: 0 12px;
      box-sizing: border-box;
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.15));
      border-radius: 4px;
      background: var(
        --secondary-background-color,
        rgba(255, 255, 255, 0.05)
      );
      color: var(--primary-text-color);
      font-family: inherit;
      font-size: 14px;
      line-height: 1.2;
      outline: none;
      transition: border-color 0.15s ease;
      -webkit-appearance: none;
      appearance: none;
    }
    .card-name-field:focus,
    .name-field:focus {
      border-color: var(--primary-color, #03a9f4);
    }
    .card-name-field::placeholder,
    .name-field::placeholder {
      color: var(--secondary-text-color, rgba(0, 0, 0, 0.45));
      opacity: 1;
    }
    .icon-picker {
      flex: 1 1 0;
      min-width: 0;
      width: 100%;
    }
    .entity-picker {
      width: 100%;
    }
    .room-off-picker {
      width: 100%;
    }
    .width-toggle {
      display: flex;
      width: 110px;
      height: 40px;
      background: var(
        --secondary-background-color,
        rgba(255, 255, 255, 0.05)
      );
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.1));
      border-radius: 6px;
      padding: 2px;
      box-sizing: border-box;
      overflow: hidden;
    }
    .width-toggle button {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: var(--primary-text-color);
      font-size: 12px;
      font-weight: 500;
      padding: 0 6px;
      font-family: inherit;
      text-transform: none;
      letter-spacing: 0;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
    }
    .width-toggle button:hover:not(.selected) {
      background: var(--divider-color, rgba(0, 0, 0, 0.06));
    }
    .width-toggle button.selected {
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }
    .width-toggle button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 1px;
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
