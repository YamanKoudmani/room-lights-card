import type { HassEntity } from 'home-assistant-js-websocket';
import type { LovelaceCardConfig } from 'custom-card-helpers';

/** A single light entity tile */
export interface LightEntityConfig {
  entity: string;
  columns: 1 | 2;
  /** Optional display name override. Falls back to the entity's
   *  friendly_name, then the entity_id, when unset. */
  name?: string;
  /** Optional MDI icon override (e.g. "mdi:lamp"). Falls back to
   *  the entity's state-driven icon, then FALLBACK_TILE_ICON, when
   *  unset. When set, the icon is FIXED regardless of on/off state. */
  icon?: string;
}

/** Root card config */
export interface RoomLightsCardConfig extends LovelaceCardConfig {
  type: string;
  name: string;
  entities: LightEntityConfig[];
  /** Optional custom icon override for the card header. */
  icon?: string;
  /**
   * Optional master target for the header tap. When set, the header toggles
   * THIS entity (a light, group, or switch) instead of the tile entities.
   * Tile entities remain individually toggleable. Use this to bind the card
   * to a HA light group (e.g. `group.living_room_lights`) so the header
   * represents the whole room while the tiles show a curated subset.
   */
  room_off?: string;
  /**
   * Compact layout: removes the gap between tiles, tightens inner padding,
   * and makes tile borders transparent so flush-adjacent tiles don't show
   * a double border. Useful when you have many entities and want to fit
   * more in the same vertical space.
   */
  compact?: boolean;
}

/** Resolved per-tile info for rendering */
export interface LightTileInfo {
  config: LightEntityConfig;
  stateObj: HassEntity | null;
  name: string;
  /** Resolved icon to render. Always set (falls back to FALLBACK_TILE_ICON). */
  icon: string;
  status: string;
  isOn: boolean;
  isUnavailable: boolean;
}

/** Aggregate state of every light in the room */
export interface RoomState {
  anyOn: boolean;
  allOn: boolean;
  onCount: number;
  total: number;
}
