import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from 'custom-card-helpers';
import { fireEvent } from 'custom-card-helpers';
import type { HassEntity } from 'home-assistant-js-websocket';

import {
  ACCENT_ON,
  CARD_VERSION,
  FALLBACK_TILE_ICON,
  LONG_PRESS_MS,
} from './const';
import { unsafeCSS } from 'lit';
import type { RoomLightsCardConfig, LightTileInfo, RoomState } from './types';
import {
  aggregateRoomState,
  headerIconFor,
  headerStatusText,
  resolveLightTile,
} from './utils';

import './editor';

interface PressState {
  entityId: string;
  timer: number;
  triggered: boolean;
}

@customElement('room-lights-card')
export class RoomLightsCard extends LitElement {
  @property({ attribute: false })
  public hass?: HomeAssistant;

  @state()
  private _config?: RoomLightsCardConfig;

  private _press: PressState | null = null;

  // Bound listeners so we can add/remove them on connect/disconnect
  private readonly _onPointerDown = (e: PointerEvent): void =>
    this._handlePointerDown(e);
  private readonly _onPointerCancel = (e: PointerEvent): void =>
    this._handlePointerCancel(e);
  private readonly _onClick = (e: MouseEvent): void => this._handleClick(e);

  static getConfigElement(): HTMLElement {
    return document.createElement('room-lights-card-editor') as HTMLElement;
  }

  static getStubConfig(): Record<string, unknown> {
    return {
      name: 'Living Room',
      entities: [
        { entity: 'light.example_1', columns: 1 },
        { entity: 'light.example_2', columns: 2 },
        { entity: 'light.example_3', columns: 2 },
      ],
    };
  }

  getCardSize(): number {
    // 2 rows for the header section (12px padding + ~46px header +
    // 14px grid margin) + 1 row per computed tile row. `1 + rows`
    // was 4-8px too short and caused the card to overflow the
    // dashboard's grid cell; the original `2 + rows * 2` left a
    // ~2-row empty band. `2 + rows` is the minimum that keeps
    // every tile fully inside the allocated space.
    return 2 + this._computeRows();
  }

  getGridOptions(): {
    rows: number;
    min_rows: number;
    max_rows: number;
    columns: number;
    min_columns: number;
    max_columns: number;
  } {
    return {
      rows: 2 + this._computeRows(),
      min_rows: 3,
      max_rows: 8,
      columns: 12,
      min_columns: 6,
      max_columns: 12,
    };
  }

  setConfig(config: RoomLightsCardConfig): void {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration');
    }
    if (!config.name) {
      throw new Error('You must define a `name` for the card');
    }
    if (!Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error('You must define at least one entity in `entities`');
    }

    // Normalise: accept bare strings, default columns to 1.
    const entities = config.entities
      .map((e: unknown) => {
        if (typeof e === 'string') return { entity: e, columns: 1 as 1 | 2 };
        if (e && typeof e === 'object') {
          const obj = e as Record<string, unknown>;
          const entity = typeof obj.entity === 'string' ? obj.entity : '';
          const columns: 1 | 2 = obj.columns === 2 ? 2 : 1;
          return { entity, columns };
        }
        return { entity: '', columns: 1 as 1 | 2 };
      })
      .filter((e) => e.entity.length > 0);

    if (entities.length === 0) {
      throw new Error('No valid light entities found in `entities`');
    }

    // Normalise room_off: empty string → undefined so a cleared editor
    // picker removes the field rather than passing an invalid entity_id.
    const rawRoomOff =
      typeof config.room_off === 'string' ? config.room_off.trim() : '';
    const roomOff = rawRoomOff.length > 0 ? rawRoomOff : undefined;

    this._config = {
      ...config,
      type: config.type ?? 'custom:room-lights-card',
      entities,
      room_off: roomOff,
    };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('pointerdown', this._onPointerDown);
    this.addEventListener('pointercancel', this._onPointerCancel);
    this.addEventListener('click', this._onClick, { capture: true });
  }

  disconnectedCallback(): void {
    this.removeEventListener('pointerdown', this._onPointerDown);
    this.removeEventListener('pointercancel', this._onPointerCancel);
    this.removeEventListener('click', this._onClick, { capture: true });
    this._clearPress();
    super.disconnectedCallback();
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;

    const cfg = this._config;
    const tiles: LightTileInfo[] = cfg.entities.map((e) =>
      resolveLightTile(this.hass, e),
    );
    const aggregate: RoomState = aggregateRoomState(
      this.hass,
      cfg.entities,
      cfg.room_off,
    );
    const anyOn = aggregate.anyOn;
    const headerIcon = headerIconFor(aggregate);
    const headerStatus = headerStatusText(aggregate);

    return html`
      <ha-card>
        <div class="card-inner">
          <div
            class="header"
            data-header
            role="button"
            tabindex="0"
            aria-label=${cfg.room_off
              ? `Toggle ${cfg.room_off}`
              : `Toggle all lights in ${cfg.name}`}
            @keydown=${this._onHeaderKey}
          >
            <ha-icon
              class="header-icon ${anyOn ? 'on' : 'off'}"
              icon=${headerIcon}
            ></ha-icon>
            <div class="header-text">
              <div class="header-name">${cfg.name}</div>
              <div class="header-status">${headerStatus}</div>
            </div>
          </div>

          <div class="grid">
            ${tiles.map((tile) => this._renderTile(tile))}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _renderTile(tile: LightTileInfo): TemplateResult {
    const { config, stateObj, name, status, isOn, isUnavailable } = tile;
    const stateClass = isUnavailable
      ? 'unavailable'
      : isOn
        ? 'on'
        : 'off';
    const sizeClass = config.columns === 2 ? 'tile-half' : 'tile-full';

    return html`
      <div
        class="tile ${sizeClass} ${stateClass}"
        data-tile
        data-entity-id=${config.entity}
        role="button"
        tabindex="0"
        aria-label="Toggle ${name}"
        @keydown=${this._onTileKey}
      >
        <div class="tile-icon-wrap">
          ${this._renderTileIcon(stateObj, isOn, isUnavailable)}
        </div>
        <div class="tile-text">
          <div class="tile-name">${name}</div>
          <div class="tile-status">${status}</div>
        </div>
      </div>
    `;
  }

  private _renderTileIcon(
    stateObj: HassEntity | null,
    isOn: boolean,
    isUnavailable: boolean,
  ): TemplateResult {
    const stateClass = isUnavailable
      ? 'unavailable'
      : isOn
        ? 'on'
        : 'off';

    if (stateObj) {
      return html`
        <ha-state-icon
          class="tile-icon ${stateClass}"
          .stateObj=${stateObj}
          .icon=${FALLBACK_TILE_ICON}
        ></ha-state-icon>
      `;
    }
    return html`
      <ha-icon
        class="tile-icon ${stateClass}"
        icon=${FALLBACK_TILE_ICON}
      ></ha-icon>
    `;
  }

  // ---------------------------------------------------------------------------
  // Event handling: long-press → more-info, tap → toggle
  // ---------------------------------------------------------------------------

  private _handlePointerDown(e: PointerEvent): void {
    const tile = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-tile]',
    );
    if (!tile) return;
    const entityId = tile.dataset.entityId;
    if (!entityId) return;

    // Don't pre-empt a quick tap-and-toggle
    this._clearPress();
    const timer = window.setTimeout(() => {
      if (this._press && this._press.entityId === entityId) {
        this._press.triggered = true;
        this._openMoreInfo(entityId);
      }
    }, LONG_PRESS_MS);
    this._press = { entityId, timer, triggered: false };
  }

  private _handlePointerCancel(_e: PointerEvent): void {
    this._clearPress();
  }

  private _handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Header tap → toggle all
    const header = target.closest('[data-header]');
    if (header) {
      e.preventDefault();
      e.stopPropagation();
      this._toggleAll();
      return;
    }

    // Tile tap → toggle single (or open more-info if we just long-pressed)
    const tile = target.closest<HTMLElement>('[data-tile]');
    if (tile) {
      const entityId = tile.dataset.entityId;
      if (!entityId) return;
      if (this._press && this._press.entityId === entityId && this._press.triggered) {
        // Long-press just fired; suppress the trailing click.
        e.preventDefault();
        e.stopPropagation();
        this._clearPress();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this._toggleLight(entityId);
      this._clearPress();
    }
  }

  private _onHeaderKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._toggleAll();
    }
  };

  private _onTileKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement | null;
      const entityId = target?.dataset.entityId;
      if (entityId) this._toggleLight(entityId);
    }
  };

  private _clearPress(): void {
    if (this._press) {
      window.clearTimeout(this._press.timer);
      this._press = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Service calls
  // ---------------------------------------------------------------------------

  private _toggleLight(entityId: string): void {
    if (!this.hass) return;
    const domain = entityId.split('.')[0];
    if (domain !== 'light' && domain !== 'switch') return;
    this.hass.callService(domain, 'toggle', { entity_id: entityId });
  }

  private _toggleAll(): void {
    if (!this.hass || !this._config) return;
    // When `room_off` is configured, the header represents that single
    // target — it's the source of truth for "the room". Tapping toggles
    // only that entity, never the tile set. (Tiles stay independently
    // toggleable.) This avoids double-toggling when room_off is a
    // `group.*` that contains the tile entities.
    if (this._config.room_off) {
      const id = this._config.room_off;
      const domain = id.split('.')[0];
      if (domain !== 'light' && domain !== 'switch') return;
      this.hass.callService(domain, 'toggle', { entity_id: id });
      return;
    }
    const ids = this._config.entities.map((e) => e.entity).filter(Boolean);
    if (ids.length === 0) return;
    // Group by domain so mixed light+switch configs work — HA's service
    // calls only accept a single domain per call.
    const byDomain = new Map<string, string[]>();
    for (const id of ids) {
      const domain = id.split('.')[0];
      if (domain !== 'light' && domain !== 'switch') continue;
      const list = byDomain.get(domain);
      if (list) list.push(id);
      else byDomain.set(domain, [id]);
    }
    for (const [domain, list] of byDomain) {
      this.hass.callService(domain, 'toggle', { entity_id: list });
    }
  }

  private _openMoreInfo(entityId: string): void {
    fireEvent(this, 'hass-more-info', { entityId });
  }

  // ---------------------------------------------------------------------------
  // Layout helpers
  // ---------------------------------------------------------------------------

  /**
   * Count grid rows for getCardSize / getGridOptions.
   * Columns 2 tiles stack two per row; columns 1 tiles take a whole row.
   */
  private _computeRows(): number {
    if (!this._config) return 0;
    let fullRows = 0;
    let halfCount = 0;
    for (const e of this._config.entities) {
      if (e.columns === 1) {
        fullRows += 1;
      } else {
        halfCount += 1;
      }
    }
    return fullRows + Math.ceil(halfCount / 2);
  }

  static styles = css`
    :host {
      display: block;
      --_room-lights-accent: ${unsafeCSS(ACCENT_ON)};
    }
    ha-card {
      border-radius: 12px;
      /* top + sides only — bottom spacing is supplied by the tile's
         own padding so the card hugs the last row of tiles instead
         of leaving a band of empty card background. */
      padding: 12px 16px 0;
      box-sizing: border-box;
      max-width: 100%;
      overflow: hidden;
      background: var(
        --ha-card-background,
        var(
          --card-background-color,
          var(--secondary-background-color, #f5f5f5)
        )
      );
    }
    .card-inner {
      display: flex;
      flex-direction: column;
    }

    /* Header ---------------------------------------------------------------- */
    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 8px 6px;
      border-radius: 10px;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      transition: background-color 0.15s ease;
    }
    .header:hover {
      background-color: var(--divider-color, rgba(0, 0, 0, 0.05));
    }
    .header:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .header-icon {
      --mdc-icon-size: 28px;
      flex-shrink: 0;
    }
    .header-icon.on {
      color: var(--accent-on, var(--_room-lights-accent, #f5c842));
    }
    .header-icon.off {
      color: var(--secondary-text-color, #9e9e9e);
    }
    .header-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .header-name {
      font-size: 15px;
      font-weight: 500;
      color: var(--primary-text-color);
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header-status {
      font-size: 13px;
      color: var(--secondary-text-color);
      line-height: 1.2;
    }

    /* Grid ----------------------------------------------------------------- */
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 14px;
    }

    /* Tile ----------------------------------------------------------------- */
    .tile {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
      border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.08));
      border-radius: 10px;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      touch-action: manipulation;
      min-width: 0;
      box-sizing: border-box;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .tile:hover {
      background-color: var(--divider-color, rgba(0, 0, 0, 0.08));
    }
    .tile:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .tile-full {
      grid-column: 1 / -1;
    }
    .tile-half {
      grid-column: span 1;
    }
    .tile.unavailable {
      opacity: 0.55;
    }
    .tile.on {
      border-color: var(--accent-on, var(--_room-lights-accent, #f5c842));
    }
    .tile-icon-wrap {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tile-icon {
      --mdc-icon-size: 22px;
      display: flex;
    }
    .tile-icon.on {
      color: var(--accent-on, var(--_room-lights-accent, #f5c842)) !important;
    }
    .tile-icon.off {
      color: var(--secondary-text-color, #9e9e9e) !important;
    }
    .tile.unavailable .tile-icon {
      color: var(--disabled-text-color, #9e9e9e) !important;
    }
    .tile-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .tile-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tile.on .tile-name {
      color: var(--accent-on, var(--_room-lights-accent, #f5c842));
    }
    .tile.unavailable .tile-name {
      color: var(--disabled-text-color, #9e9e9e);
    }
    .tile-status {
      font-size: 12px;
      color: var(--secondary-text-color);
      line-height: 1.2;
    }
    .tile.on .tile-status {
      color: var(--accent-on, var(--_room-lights-accent, #f5c842));
      opacity: 0.85;
    }
    .tile.unavailable .tile-status {
      color: var(--disabled-text-color, #9e9e9e);
    }
  `;
}

// ---------------------------------------------------------------------------
// HACS / custom card registration
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      description: string;
      preview?: boolean;
    }>;
  }
}

const accentStyle = `background:${ACCENT_ON};color:#1a1a1a;padding:2px 6px;border-radius:4px;font-weight:600`;
console.info(
  `%cROOM-LIGHTS-CARD%c v${CARD_VERSION} %cloaded`,
  accentStyle,
  'background:#222;color:#fff;padding:2px 6px;border-radius:4px',
  'color:#888',
);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'room-lights-card',
  name: 'Room Lights Card',
  description:
    'Control all lights in a room from a single tappable card. Tap a tile to toggle, long-press for more-info.',
  preview: true,
});
