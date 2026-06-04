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
