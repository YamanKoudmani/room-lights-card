import type { HomeAssistant } from 'custom-card-helpers';
import type { HassEntity } from 'home-assistant-js-websocket';
import {
  ICON_ANY_ON,
  ICON_OFF_ALL,
  DEFAULT_COLUMNS,
} from './const';
import type {
  LightEntityConfig,
  LightTileInfo,
  RoomState,
} from './types';

/** Look up a state object from hass by entity_id. */
export function getStateObj(
  hass: HomeAssistant | undefined,
  entityId: string,
): HassEntity | null {
  if (!hass || !entityId) return null;
  return hass.states[entityId] ?? null;
}

/** True when the entity is missing, or its state is unavailable/unknown. */
export function isUnavailable(stateObj: HassEntity | null | undefined): boolean {
  if (!stateObj) return true;
  return stateObj.state === 'unavailable' || stateObj.state === 'unknown';
}

/** Convert a 0-255 brightness to a 0-100 percentage. Returns null when off
 *  or when brightness isn't reported. */
export function brightnessPercent(
  stateObj: HassEntity | null | undefined,
): number | null {
  if (!stateObj || stateObj.state !== 'on') return null;
  const b = stateObj.attributes?.brightness;
  if (typeof b !== 'number' || b <= 0) return null;
  return Math.round((b / 255) * 100);
}

/** Human-readable status line shown under the tile name. */
export function statusText(stateObj: HassEntity | null | undefined): string {
  if (!stateObj) return 'Unavailable';
  if (isUnavailable(stateObj)) {
    return stateObj.state === 'unknown' ? 'Unknown' : 'Unavailable';
  }
  if (stateObj.state === 'on') {
    const pct = brightnessPercent(stateObj);
    if (pct !== null) return `${pct}%`;
    return 'On';
  }
  if (stateObj.state === 'off') return 'Off';
  // Any other state (e.g. for grouped lights): capitalise
  return stateObj.state.charAt(0).toUpperCase() + stateObj.state.slice(1);
}

/** Resolve a single config entry to render-ready info. */
export function resolveLightTile(
  hass: HomeAssistant | undefined,
  config: LightEntityConfig,
): LightTileInfo {
  const stateObj = getStateObj(hass, config.entity);
  const friendly = stateObj?.attributes?.friendly_name;
  const name =
    typeof friendly === 'string' && friendly.length > 0
      ? friendly
      : config.entity || 'Unknown';
  const isOn = !!stateObj && stateObj.state === 'on';
  return {
    config,
    stateObj,
    name,
    status: statusText(stateObj),
    isOn,
    isUnavailable: isUnavailable(stateObj),
  };
}

/** Aggregate state across all configured lights, or across a single
 *  `room_off` target when one is configured. The latter is the "header
 *  is the source of truth for the whole room" model. */
export function aggregateRoomState(
  hass: HomeAssistant | undefined,
  entities: LightEntityConfig[],
  roomOff?: string,
): RoomState {
  if (roomOff) {
    const stateObj = getStateObj(hass, roomOff);
    if (!stateObj) {
      return { anyOn: false, allOn: false, onCount: 0, total: 0 };
    }
    const isOn = stateObj.state === 'on';
    return { anyOn: isOn, allOn: isOn, onCount: isOn ? 1 : 0, total: 1 };
  }
  const total = entities.length;
  let onCount = 0;
  for (const e of entities) {
    const stateObj = getStateObj(hass, e.entity);
    if (stateObj && stateObj.state === 'on') onCount += 1;
  }
  return {
    anyOn: onCount > 0,
    allOn: total > 0 && onCount === total,
    onCount,
    total,
  };
}

/** Header status text. */
export function headerStatusText(agg: RoomState): string {
  if (agg.total === 0) return 'No lights';
  if (!agg.anyOn) return 'Off';
  if (agg.allOn) return 'On';
  return `${agg.onCount} on`;
}

/** Header icon: lightbulb-off when everything is off, lightbulb otherwise. */
export function headerIconFor(agg: RoomState): string {
  return agg.anyOn ? ICON_ANY_ON : ICON_OFF_ALL;
}

/** True when this config slot is the half-width slot. */
export function isHalfWidth(columns: 1 | 2 | undefined): boolean {
  return (columns ?? DEFAULT_COLUMNS) === 2;
}
