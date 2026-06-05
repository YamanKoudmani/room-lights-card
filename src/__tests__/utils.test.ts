import { describe, it, expect } from 'vitest';
import type { HomeAssistant } from 'custom-card-helpers';
import type { HassEntity } from 'home-assistant-js-websocket';
import {
  getStateObj,
  isUnavailable,
  brightnessPercent,
  statusText,
  aggregateRoomState,
  headerStatusText,
  headerIconFor,
  resolveLightTile,
} from '../utils';
import { ICON_ANY_ON, ICON_OFF_ALL } from '../const';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeHass(entities: Record<string, Partial<HassEntity>>): HomeAssistant {
  return {
    states: entities as unknown as HomeAssistant['states'],
    callService: () => Promise.resolve(),
    callWS: () => Promise.resolve(),
    config: {} as HomeAssistant['config'],
    user: {} as HomeAssistant['user'],
    auth: {} as HomeAssistant['auth'],
    connection: {} as HomeAssistant['connection'],
    themes: {} as HomeAssistant['themes'],
    selectedTheme: null,
    panels: {} as HomeAssistant['panels'],
    panelUrl: '',
    language: 'en',
    localTimezone: 'UTC',
    translationMetadata: {} as HomeAssistant['translationMetadata'],
    // Anything else falls through as undefined; we only exercise fields used.
  } as unknown as HomeAssistant;
}

const light = (
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity =>
  ({
    entity_id: 'light.test',
    state,
    attributes,
    last_changed: '',
    last_updated: '',
    context: { id: 'x', parent_id: null, user_id: null },
  } as unknown as HassEntity);

// ---------------------------------------------------------------------------
// getStateObj
// ---------------------------------------------------------------------------

describe('getStateObj', () => {
  it('returns null when hass is undefined', () => {
    expect(getStateObj(undefined, 'light.a')).toBeNull();
  });

  it('returns null when entity id is empty', () => {
    const hass = makeHass({});
    expect(getStateObj(hass, '')).toBeNull();
  });

  it('returns null for an unknown entity id', () => {
    const hass = makeHass({});
    expect(getStateObj(hass, 'light.missing')).toBeNull();
  });

  it('returns the state object for a known entity', () => {
    const s = light('on');
    const hass = makeHass({ 'light.a': s });
    expect(getStateObj(hass, 'light.a')).toBe(s);
  });
});

// ---------------------------------------------------------------------------
// isUnavailable
// ---------------------------------------------------------------------------

describe('isUnavailable', () => {
  it('true for null', () => expect(isUnavailable(null)).toBe(true));
  it('true for undefined', () => expect(isUnavailable(undefined)).toBe(true));
  it('true for unavailable state', () =>
    expect(isUnavailable(light('unavailable'))).toBe(true));
  it('true for unknown state', () =>
    expect(isUnavailable(light('unknown'))).toBe(true));
  it('false for on', () => expect(isUnavailable(light('on'))).toBe(false));
  it('false for off', () => expect(isUnavailable(light('off'))).toBe(false));
});

// ---------------------------------------------------------------------------
// brightnessPercent
// ---------------------------------------------------------------------------

describe('brightnessPercent', () => {
  it('null when off', () => {
    expect(brightnessPercent(light('off', { brightness: 200 }))).toBeNull();
  });

  it('null when state is null', () => {
    expect(brightnessPercent(null)).toBeNull();
  });

  it('null when brightness attribute is missing', () => {
    expect(brightnessPercent(light('on'))).toBeNull();
  });

  it('null when brightness is 0', () => {
    expect(brightnessPercent(light('on', { brightness: 0 }))).toBeNull();
  });

  it('rounds 127 to 50', () => {
    expect(brightnessPercent(light('on', { brightness: 127 }))).toBe(50);
  });

  it('rounds 128 to 50', () => {
    expect(brightnessPercent(light('on', { brightness: 128 }))).toBe(50);
  });

  it('returns 100 for 255', () => {
    expect(brightnessPercent(light('on', { brightness: 255 }))).toBe(100);
  });

  it('rounds 100 to 39', () => {
    expect(brightnessPercent(light('on', { brightness: 100 }))).toBe(39);
  });

  it('rounds 26 to 10', () => {
    expect(brightnessPercent(light('on', { brightness: 26 }))).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// statusText
// ---------------------------------------------------------------------------

describe('statusText', () => {
  it('"Off" for off', () => {
    expect(statusText(light('off'))).toBe('Off');
  });

  it('"On" for on with no brightness', () => {
    expect(statusText(light('on'))).toBe('On');
  });

  it('"50%" for on with brightness 128', () => {
    expect(statusText(light('on', { brightness: 128 }))).toBe('50%');
  });

  it('"Unavailable" for unavailable', () => {
    expect(statusText(light('unavailable'))).toBe('Unavailable');
  });

  it('"Unknown" for unknown', () => {
    expect(statusText(light('unknown'))).toBe('Unknown');
  });

  it('"Unavailable" for null', () => {
    expect(statusText(null)).toBe('Unavailable');
  });

  it('capitalises non-standard states', () => {
    expect(statusText(light('opening'))).toBe('Opening');
  });
});

// ---------------------------------------------------------------------------
// aggregateRoomState
// ---------------------------------------------------------------------------

describe('aggregateRoomState', () => {
  it('empty config', () => {
    expect(aggregateRoomState(undefined, [])).toEqual({
      anyOn: false,
      allOn: false,
      onCount: 0,
      total: 0,
    });
  });

  it('all off', () => {
    const hass = makeHass({
      'light.a': light('off'),
      'light.b': light('off'),
    });
    expect(
      aggregateRoomState(hass, [
        { entity: 'light.a', columns: 1 },
        { entity: 'light.b', columns: 1 },
      ]),
    ).toEqual({ anyOn: false, allOn: false, onCount: 0, total: 2 });
  });

  it('mixed', () => {
    const hass = makeHass({
      'light.a': light('on'),
      'light.b': light('off'),
      'light.c': light('on'),
    });
    expect(
      aggregateRoomState(hass, [
        { entity: 'light.a', columns: 1 },
        { entity: 'light.b', columns: 1 },
        { entity: 'light.c', columns: 1 },
      ]),
    ).toEqual({ anyOn: true, allOn: false, onCount: 2, total: 3 });
  });

  it('all on', () => {
    const hass = makeHass({
      'light.a': light('on'),
      'light.b': light('on'),
    });
    expect(
      aggregateRoomState(hass, [
        { entity: 'light.a', columns: 1 },
        { entity: 'light.b', columns: 1 },
      ]),
    ).toEqual({ anyOn: true, allOn: true, onCount: 2, total: 2 });
  });

  it('missing entities count as off', () => {
    const hass = makeHass({});
    expect(
      aggregateRoomState(hass, [{ entity: 'light.missing', columns: 1 }]),
    ).toEqual({ anyOn: false, allOn: false, onCount: 0, total: 1 });
  });
});

// ---------------------------------------------------------------------------
// aggregateRoomState with room_off (header-as-source-of-truth mode)
// ---------------------------------------------------------------------------

describe('aggregateRoomState with room_off', () => {
  it('uses room_off state when set (on)', () => {
    const hass = makeHass({
      'group.living_room_lights': light('on'),
      // Tile entities are off — must be ignored when room_off is set.
      'light.a': light('off'),
      'light.b': light('off'),
    });
    expect(
      aggregateRoomState(
        hass,
        [
          { entity: 'light.a', columns: 1 },
          { entity: 'light.b', columns: 1 },
        ],
        'group.living_room_lights',
      ),
    ).toEqual({ anyOn: true, allOn: true, onCount: 1, total: 1 });
  });

  it('uses room_off state when set (off)', () => {
    const hass = makeHass({
      'group.living_room_lights': light('off'),
      'light.a': light('on'),
    });
    expect(
      aggregateRoomState(
        hass,
        [{ entity: 'light.a', columns: 1 }],
        'group.living_room_lights',
      ),
    ).toEqual({ anyOn: false, allOn: false, onCount: 0, total: 1 });
  });

  it('returns all-off when room_off entity is missing from hass', () => {
    const hass = makeHass({});
    expect(
      aggregateRoomState(
        hass,
        [{ entity: 'light.a', columns: 1 }],
        'group.missing',
      ),
    ).toEqual({ anyOn: false, allOn: false, onCount: 0, total: 0 });
  });

  it('falls back to tile aggregation when room_off is undefined', () => {
    const hass = makeHass({ 'light.a': light('on') });
    expect(
      aggregateRoomState(
        hass,
        [{ entity: 'light.a', columns: 1 }],
        undefined,
      ),
    ).toEqual({ anyOn: true, allOn: true, onCount: 1, total: 1 });
  });
});

// ---------------------------------------------------------------------------
// headerStatusText
// ---------------------------------------------------------------------------

describe('headerStatusText', () => {
  it('"No lights" for empty', () => {
    expect(headerStatusText({ anyOn: false, allOn: false, onCount: 0, total: 0 })).toBe('No lights');
  });
  it('"Off" for all off', () => {
    expect(headerStatusText({ anyOn: false, allOn: false, onCount: 0, total: 3 })).toBe('Off');
  });
  it('"On" for all on', () => {
    expect(headerStatusText({ anyOn: true, allOn: true, onCount: 3, total: 3 })).toBe('On');
  });
  it('"3 on" for mixed', () => {
    expect(headerStatusText({ anyOn: true, allOn: false, onCount: 3, total: 5 })).toBe('3 on');
  });
});

// ---------------------------------------------------------------------------
// headerIconFor
// ---------------------------------------------------------------------------

describe('headerIconFor', () => {
  it('lightbulb-off when none on', () => {
    expect(
      headerIconFor({ anyOn: false, allOn: false, onCount: 0, total: 2 }),
    ).toBe(ICON_OFF_ALL);
  });
  it('lightbulb when any on', () => {
    expect(
      headerIconFor({ anyOn: true, allOn: false, onCount: 1, total: 2 }),
    ).toBe(ICON_ANY_ON);
  });
  it('lightbulb when all on', () => {
    expect(
      headerIconFor({ anyOn: true, allOn: true, onCount: 2, total: 2 }),
    ).toBe(ICON_ANY_ON);
  });
});

// ---------------------------------------------------------------------------
// resolveLightTile
// ---------------------------------------------------------------------------

describe('resolveLightTile', () => {
  it('uses friendly_name when present', () => {
    const hass = makeHass({
      'light.a': light('off', { friendly_name: 'Couch Lamp' }),
    });
    const t = resolveLightTile(hass, { entity: 'light.a', columns: 1 });
    expect(t.name).toBe('Couch Lamp');
    expect(t.isOn).toBe(false);
    expect(t.isUnavailable).toBe(false);
    expect(t.status).toBe('Off');
  });

  it('falls back to entity_id when friendly_name missing', () => {
    const hass = makeHass({
      'light.a': light('off'),
    });
    const t = resolveLightTile(hass, { entity: 'light.a', columns: 2 });
    expect(t.name).toBe('light.a');
  });

  it('marks as unavailable when state is unknown', () => {
    const hass = makeHass({ 'light.a': light('unknown') });
    const t = resolveLightTile(hass, { entity: 'light.a', columns: 1 });
    expect(t.isUnavailable).toBe(true);
    expect(t.isOn).toBe(false);
  });

  it('marks as unavailable when hass is undefined', () => {
    const t = resolveLightTile(undefined, { entity: 'light.a', columns: 1 });
    expect(t.isUnavailable).toBe(true);
    expect(t.isOn).toBe(false);
    expect(t.name).toBe('light.a');
    expect(t.stateObj).toBeNull();
  });

  it('reflects on state with brightness in status', () => {
    const hass = makeHass({
      'light.a': light('on', { brightness: 255, friendly_name: 'Big Light' }),
    });
    const t = resolveLightTile(hass, { entity: 'light.a', columns: 1 });
    expect(t.isOn).toBe(true);
    expect(t.isUnavailable).toBe(false);
    expect(t.status).toBe('100%');
    expect(t.name).toBe('Big Light');
  });

  it('uses custom name override when provided', () => {
    const hass = makeHass({
      'light.a': light('off', { friendly_name: 'Couch Lamp' }),
    });
    const t = resolveLightTile(hass, {
      entity: 'light.a',
      columns: 1,
      name: 'Reading Nook',
    });
    expect(t.name).toBe('Reading Nook');
  });

  it('trims whitespace around custom name', () => {
    const hass = makeHass({
      'light.a': light('off', { friendly_name: 'Couch Lamp' }),
    });
    const t = resolveLightTile(hass, {
      entity: 'light.a',
      columns: 1,
      name: '  Spaced Out  ',
    });
    expect(t.name).toBe('Spaced Out');
  });

  it('falls back to friendly_name when custom name is empty string', () => {
    const hass = makeHass({
      'light.a': light('off', { friendly_name: 'Couch Lamp' }),
    });
    const t = resolveLightTile(hass, {
      entity: 'light.a',
      columns: 1,
      name: '',
    });
    expect(t.name).toBe('Couch Lamp');
  });

  it('resolves custom icon when provided', () => {
    const hass = makeHass({
      'light.a': light('on', { friendly_name: 'Couch Lamp' }),
    });
    const t = resolveLightTile(hass, {
      entity: 'light.a',
      columns: 1,
      icon: 'mdi:lamp',
    });
    expect(t.icon).toBe('mdi:lamp');
  });

  it('falls back to default icon when no custom icon', () => {
    const hass = makeHass({
      'light.a': light('on', { friendly_name: 'Couch Lamp' }),
    });
    const t = resolveLightTile(hass, { entity: 'light.a', columns: 1 });
    expect(t.icon).toBe('mdi:lightbulb');
  });

  it('falls back to default icon when custom icon is empty string', () => {
    const hass = makeHass({
      'light.a': light('on', { friendly_name: 'Couch Lamp' }),
    });
    const t = resolveLightTile(hass, {
      entity: 'light.a',
      columns: 1,
      icon: '',
    });
    expect(t.icon).toBe('mdi:lightbulb');
  });
});
