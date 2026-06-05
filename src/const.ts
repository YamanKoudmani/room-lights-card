import type { LightEntityConfig } from './types';

export const CARD_VERSION = '1.0.21';
export const CARD_TAG = 'room-lights-card';
export const EDITOR_TAG = 'room-lights-card-editor';

/** Accent color for on-state icons + label (warm white) */
export const ACCENT_ON = '#f5c842';

/** Header icons */
export const ICON_OFF_ALL = 'mdi:lightbulb-off';
export const ICON_ANY_ON = 'mdi:lightbulb';

/** Tile fallback icon (used only when stateObj is unavailable) */
export const FALLBACK_TILE_ICON = 'mdi:lightbulb';

/** Long-press threshold to open more-info dialog (ms) */
export const LONG_PRESS_MS = 500;

/** Default layout values */
export const DEFAULT_COLUMNS: 1 | 2 = 1; // 1 = full width, 2 = half width

/** Normalise a LightEntityConfig entry to a strict shape. */
export function normalizeLightConfig(input: unknown): LightEntityConfig {
  if (typeof input === 'string') {
    return { entity: input, columns: DEFAULT_COLUMNS };
  }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const entity = typeof obj.entity === 'string' ? obj.entity : '';
    const columns: 1 | 2 = obj.columns === 2 ? 2 : 1;
    const name =
      typeof obj.name === 'string' && obj.name.trim().length > 0
        ? obj.name.trim()
        : undefined;
    const icon =
      typeof obj.icon === 'string' && obj.icon.trim().length > 0
        ? obj.icon.trim()
        : undefined;
    const out: LightEntityConfig = { entity, columns };
    if (name !== undefined) out.name = name;
    if (icon !== undefined) out.icon = icon;
    return out;
  }
  return { entity: '', columns: DEFAULT_COLUMNS };
}
