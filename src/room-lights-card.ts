import { LitElement, html, css, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant } from 'custom-card-helpers';
import { fireEvent } from 'custom-card-helpers';
import type { HassEntity } from 'home-assistant-js-websocket';

import {
  ACCENT_ON,
  CARD_VERSION,
  FALLBACK_TILE_ICON,
  LONG_PRESS_MS,
  normalizeLightConfig,
} from './const';
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

  // Bound listeners. Click / pointerdown live on the tile and header
  // elements themselves (via Lit `@event` bindings) rather than on the
  // host — an event fired inside an `ha-icon`'s shadow root gets its
  // `target` retargeted to the host when it crosses the shadow boundary,
  // which would defeat any `e.target.closest('[data-tile]')` lookup.
  // `pointercancel` has no tile-specific target to find, so it stays on
  // the host and only needs to clear in-flight press state.
  private readonly _onHeaderClick = (): void => this._toggleAll();
  private readonly _onTileClick = (e: MouseEvent): void =>
    this._handleTileClick(e);
  private readonly _onTilePointerDown = (e: PointerEvent): void =>
    this._handleTilePointerDown(e);
  private readonly _onPointerCancel = (_e: PointerEvent): void =>
    this._handlePointerCancel();

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
    // Masonry view: HA queries this once when placing the card and
    // allocates `size * 50px` of vertical space. The base accounts
    // for the card chrome (header + padding + grid margin) above the
    // tile grid; _computeRows() counts the tile rows themselves.
    // Sections view ignores this and uses getGridOptions() instead.
    return this._baseRows() + this._computeRows();
  }

  getGridOptions(): {
    rows: number | 'auto';
    columns: number;
    min_columns: number;
    max_columns: number;
  } {
    // Sections view: `rows: 'auto'` tells HA's grid section to size
    // the cell to fit our actual rendered height (its own
    // .card { height: auto } kicks in; the .fit-rows class is only
    // applied for numeric rows). This is the same approach
    // hui-error-card uses for its content-driven size. It avoids the
    // previous off-by-one clipping problem: the old static
    // `_baseRows() + _computeRows()` was tuned for 56px rows without
    // gaps, but HA's actual pitch in a grid section is 64px
    // (56 row + 8 gap, per hui-grid-section CSS), and the chrome
    // (header + padding + grid margin) is ~138px — both
    // considerations pushed the old formula below the real content
    // height, clipping the last tile row into the card below.
    // getGridOptions() is re-evaluated on every render, so adding or
    // removing tiles (or toggling compact) reflows the cell too.
    return {
      rows: 'auto',
      columns: 12,
      min_columns: 6,
      max_columns: 12,
    };
  }

  /**
   * Chrome (header + padding + grid margin) above the tile grid, in
   * masonry-view units (50px each). Sections view uses `rows: 'auto'`
   * in getGridOptions() and doesn't need this constant. Compact mode
   * is tighter, so 1 row less is enough.
   */
  private _baseRows(): number {
    return this._config?.compact ? 1 : 2;
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

    // Normalise: accept bare strings, default columns to 1, and
    // PRESERVE the per-entity `name` and `icon` overrides. The
    // previous version of this loop rebuilt each entity as
    // `{entity, columns}` only, silently stripping any name/icon the
    // user had set in the editor — so the card preview never reflected
    // the overrides. `normalizeLightConfig` does the right thing.
    const entities = config.entities
      .map((e) => normalizeLightConfig(e))
      .filter((e) => e.entity.length > 0);

    if (entities.length === 0) {
      throw new Error('No valid light entities found in `entities`');
    }

    // Normalise room_off: empty string → undefined so a cleared editor
    // picker removes the field rather than passing an invalid entity_id.
    const rawRoomOff =
      typeof config.room_off === 'string' ? config.room_off.trim() : '';
    const roomOff = rawRoomOff.length > 0 ? rawRoomOff : undefined;

    // Validate room_off shape: HA entity_ids are <domain>.<object_id>
    // (lowercase letters and underscores for the domain, lowercase
    // letters, digits, and underscores for the object_id). Catching
    // typos here gives the user a readable error in the dev tools
    // console instead of "service not found" at toggle time.
    if (roomOff !== undefined && !/^[a-z_]+\.[a-z0-9_]+$/i.test(roomOff)) {
      throw new Error(
        `Invalid \`room_off\` entity_id: "${config.room_off}" (expected format: "domain.object_id")`,
      );
    }

    // Normalise icon: empty string → undefined so a cleared editor
    // picker removes the field.
    const rawIcon =
      typeof config.icon === 'string' ? config.icon.trim() : '';
    const icon = rawIcon.length > 0 ? rawIcon : undefined;

    this._config = {
      ...config,
      type: config.type ?? 'custom:room-lights-card',
      entities,
      room_off: roomOff,
      icon,
    };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('pointercancel', this._onPointerCancel);
  }

  disconnectedCallback(): void {
    this.removeEventListener('pointercancel', this._onPointerCancel);
    this._clearPress();
    super.disconnectedCallback();
  }

  protected shouldUpdate(changedProperties: PropertyValues): boolean {
    if (changedProperties.has('_config')) return true;
    if (!changedProperties.has('hass')) return true;

    const oldHass = changedProperties.get('hass') as HomeAssistant | undefined;
    const newHass = this.hass;
    if (!oldHass || !newHass) return true;

    const cfg = this._config;
    if (!cfg) return true;

    const watchedIds = cfg.entities.map((e) => e.entity);
    if (cfg.room_off) watchedIds.push(cfg.room_off);

    for (const eid of watchedIds) {
      if (oldHass.states[eid] !== newHass.states[eid]) return true;
    }
    return false;
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
    // cfg.icon is already normalised to undefined when empty in setConfig,
    // so a single nullish check is enough. Falls back to the smart group
    // icons: mdi:lightbulb-group-off when all off, mdi:lightbulb-group
    // when any light is on. A custom icon overrides both.
    const headerIcon = cfg.icon ?? headerIconFor(aggregate);
    const headerStatus = headerStatusText(aggregate);

    return html`
      <ha-card class=${cfg.compact ? 'compact' : ''}>
        <div class="card-inner">
          <div
            class="header"
            data-header
            role="button"
            tabindex="0"
            aria-label=${cfg.room_off
              ? `Toggle ${cfg.room_off}`
              : `Toggle all lights in ${cfg.name}`}
            @click=${this._onHeaderClick}
            @keydown=${this._onHeaderKey}
          >
            <ha-icon
              class="header-icon ${anyOn ? 'on' : 'off'}"
              icon=${headerIcon}
            ></ha-icon>
            <div class="header-name">${cfg.name}</div>
            <div class="header-status">${headerStatus}</div>
          </div>

          <div class="grid">
            ${tiles.map((tile) => this._renderTile(tile))}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _renderTile(tile: LightTileInfo): TemplateResult {
    const { config, stateObj, name, icon, status, isOn, isUnavailable } = tile;
    const stateClass = isUnavailable
      ? 'unavailable'
      : isOn
        ? 'on'
        : 'off';
    const sizeClass = config.columns === 2 ? 'tile-half' : 'tile-full';
    // A custom icon means the user wants a fixed icon regardless of
    // entity state. In that case we render <ha-icon> (not <ha-state-icon>)
    // so the state-driven icon doesn't override the user's choice.
    // normalizeLightConfig already coerces empty strings to undefined,
    // so a string check is sufficient here.
    const hasCustomIcon = typeof config.icon === 'string';
    // Announce the current state so screen readers don't get a bare
    // "Toggle X" with no context. status already encodes brightness
    // (e.g. "100%") or "On"/"Off" for non-dimmable lights.
    const ariaLabel = isUnavailable
      ? `${name} unavailable`
      : `Toggle ${name}, ${isOn ? `on${status !== 'On' ? ` at ${status}` : ''}` : 'off'}`;

    return html`
      <div
        class="tile ${sizeClass} ${stateClass}"
        data-tile
        data-entity-id=${config.entity}
        role="button"
        tabindex="0"
        aria-label=${ariaLabel}
        @click=${this._onTileClick}
        @pointerdown=${this._onTilePointerDown}
        @keydown=${this._onTileKey}
      >
        <div class="tile-icon-wrap">
          ${this._renderTileIcon(
            stateObj,
            isOn,
            isUnavailable,
            hasCustomIcon ? icon : undefined,
          )}
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
    fixedIcon?: string,
  ): TemplateResult {
    const stateClass = isUnavailable
      ? 'unavailable'
      : isOn
        ? 'on'
        : 'off';

    if (fixedIcon) {
      return html`
        <ha-icon
          class="tile-icon ${stateClass}"
          icon=${fixedIcon}
        ></ha-icon>
      `;
    }
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
  //
  // Why per-element listeners (via Lit's `@event` bindings) rather than
  // a single host-level `click` / `pointerdown` listener:
  //
  // The tiles render an <ha-state-icon> / <ha-icon> inside, which itself
  // has a shadow root. When a click bubbles out of that shadow root,
  // the event's `target` is *retargeted* to the host element (the
  // <room-lights-card>), so `e.target.closest('[data-tile]')` returns
  // null and the host-level handler falls through doing nothing. With
  // Lit's per-element binding, `e.currentTarget` is the tile/header
  // itself — no shadow boundary in the way — and the entity id is read
  // straight off `currentTarget.dataset.entityId`.

  private _handleTilePointerDown(e: PointerEvent): void {
    const tile = e.currentTarget as HTMLElement | null;
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

  private _handlePointerCancel(): void {
    this._clearPress();
  }

  private _handleTileClick(e: MouseEvent): void {
    const tile = e.currentTarget as HTMLElement | null;
    if (!tile) return;
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

  private _onHeaderKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this._toggleAll();
    }
  };

  private _onTileKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement | null;
    const entityId = target?.dataset.entityId;
    if (!entityId) return;
    // Shift+Enter mirrors the long-press affordance: opens more-info
    // instead of toggling. Keeps the keyboard path parity with pointer.
    if (e.shiftKey) {
      this._openMoreInfo(entityId);
    } else {
      this._toggleLight(entityId);
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
    // Fire-and-forget: HA service calls don't need to be awaited for
    // toggle UX, and ignoring the Promise keeps this synchronous from
    // the caller's perspective.
    void this.hass.callService(domain, 'toggle', { entity_id: entityId });
  }

  private _toggleAll(): void {
    if (!this.hass || !this._config) return;

    const aggregate = aggregateRoomState(
      this.hass,
      this._config.entities,
      this._config.room_off,
    );
    const service = aggregate.anyOn ? 'turn_off' : 'turn_on';

    // When `room_off` is configured, the header represents that single
    // target — it's the source of truth for "the room". Tapping toggles
    // only that entity, never the tile set. (Tiles stay independently
    // toggleable.) This avoids double-toggling when room_off is a
    // `group.*` that contains the tile entities.
    if (this._config.room_off) {
      const id = this._config.room_off;
      const domain = id.split('.')[0];
      if (domain !== 'light' && domain !== 'switch') return;
      void this.hass.callService(domain, service, { entity_id: id });
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
      void this.hass.callService(domain, service, { entity_id: list });
    }
  }

  private _openMoreInfo(entityId: string): void {
    fireEvent(this, 'hass-more-info', { entityId });
  }

  // ---------------------------------------------------------------------------
  // Layout helpers
  // ---------------------------------------------------------------------------

  /**
   * Count grid rows for getCardSize (masonry view).
   * Columns 2 tiles stack two per row; columns 1 tiles take a whole row.
   * Sections view uses `rows: 'auto'` and doesn't need this.
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
      /* Symmetric vertical padding so the last tile row has visual
         breathing room from the card's bottom edge. The getCardSize
         formula (_baseRows() + _computeRows()) leaves room for this
         extra 12px inside the dashboard's grid cell. */
      padding: 12px 16px;
      box-sizing: border-box;
      max-width: 100%;
      overflow: hidden;
      /* Background: do NOT override --ha-card-background here. ha-card
         is a Lit element whose own :host rule already applies:
           :host {
             background: var(--ha-card-background, var(--card-background-color));
             border-color: var(--ha-card-border-color, var(--divider-color));
           }
         Earlier versions fought this by forcing --ha-card-background to
         a fixed value (#1f1f1f, transparent, or a color-mix() blend of
         --card-background-color). Every override broke a different theme:
         transparent vanished on glassmorphic themes, #1f1f1f clashed on
         light themes, and the color-mix() blend painted a visible GRAY
         panel over black/transparent backgrounds (e.g. a black wallpaper
         theme) where default HA cards stay transparent and show the
         background through.

         The fix is to simply NOT set --ha-card-background, so the theme's
         own value crosses the shadow boundary and ha-card's :host picks
         it up — exactly like every default HA card. The card then matches
         the dashboard surface on every theme (black, glassmorphic, light,
         etc.). Users can still override --ha-card-background at the
         dashboard/section level for a fully custom surface. */
      -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
      backdrop-filter: var(--ha-card-backdrop-filter, none);
      --ha-card-border-color: transparent;
    }
    .card-inner {
      display: flex;
      flex-direction: column;
    }

    /* Header ---------------------------------------------------------------- */
    .header {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 12px 6px 8px;
      border-radius: 10px;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      transition: background-color 0.15s ease;
      text-align: center;
    }
    .header:hover {
      background-color: var(--divider-color, rgba(0, 0, 0, 0.05));
    }
    .header:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .header-icon {
      --mdc-icon-size: 36px;
      flex-shrink: 0;
      margin-bottom: 2px;
    }
    .header-icon.on {
      color: var(--accent-on, var(--_room-lights-accent, #f5c842));
    }
    .header-icon.off {
      color: var(--secondary-text-color, #9e9e9e);
    }
    .header-name {
      font-size: 15px;
      font-weight: 500;
      color: var(--primary-text-color);
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
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
      /* Background: tiles default to transparent so they impose no color
         of their own — they show the card's (theme-owned) surface through
         and rely on their border + the on-state accent ring for separation.
         This keeps tiles consistent with the card on every theme, including
         black/transparent backgrounds where a previous color-mix() blend of
         --card-background-color painted a visible gray over the tiles.
         A theme or dashboard can still set --ha-card-background-tile to
         give tiles their own frosted surface. */
      background: var(--ha-card-background-tile, transparent);
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

    /* Compact mode --------------------------------------------------------- */
    /* Removes the gap between tiles, tightens outer/inner padding, and
       makes tile borders transparent so flush-adjacent tiles don't show
       a double border. Tiles separate by background-color contrast only. */
    ha-card.compact {
      padding: 8px 10px;
      border-radius: 8px;
    }
    ha-card.compact .header {
      padding: 6px 4px 4px;
      gap: 2px;
    }
    ha-card.compact .header-icon {
      --mdc-icon-size: 28px;
    }
    ha-card.compact .grid {
      gap: 0;
      margin-top: 8px;
    }
    ha-card.compact .tile {
      padding: 10px 12px;
      border-radius: 6px;
      /* Faint outline defines the tap target between flush tiles. The
         border stays in the layout (so the on-state accent ring below
         still works) but uses a low-alpha divider color so the
         double-border seam where two tiles meet is subtle, not loud.
         The .tile.on rule below restores the accent color on the
         active tile. */
      border-color: var(--divider-color, rgba(0, 0, 0, 0.12));
    }
    ha-card.compact .tile.on {
      border-color: var(--accent-on, var(--_room-lights-accent, #f5c842));
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
