import type { HassEntity } from 'home-assistant-js-websocket';
import type { LovelaceCardConfig } from 'custom-card-helpers';

/** A single light entity tile */
export interface LightEntityConfig {
  entity: string;
  columns: 1 | 2;
}

/** Root card config */
export interface RoomLightsCardConfig extends LovelaceCardConfig {
  type: string;
  name: string;
  entities: LightEntityConfig[];
  /**
   * Optional master target for the header tap. When set, the header toggles
   * THIS entity (a light, group, or switch) instead of the tile entities.
   * Tile entities remain individually toggleable. Use this to bind the card
   * to a HA light group (e.g. `group.living_room_lights`) so the header
   * represents the whole room while the tiles show a curated subset.
   */
  room_off?: string;
}

/** Resolved per-tile info for rendering */
export interface LightTileInfo {
  config: LightEntityConfig;
  stateObj: HassEntity | null;
  name: string;
  status: string;
  isOn: boolean;
  isUnavailable: boolean;
}

/** Re-export for convenience */
export type { HassEntity };

/** Aggregate state of every light in the room */
export interface RoomState {
  anyOn: boolean;
  allOn: boolean;
  onCount: number;
  total: number;
}
