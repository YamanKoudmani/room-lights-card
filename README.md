# Room Lights Card

A custom Home Assistant Lovelace card for controlling all lights in a room from a single tappable card. Tiles show on/off state and brightness, the header shows the room summary, and long-pressing any tile opens Home Assistant's more-info dialog.

## Features

- Tappable header shows the room name, a one-line status ("Off" / "On" / "N on") and toggles every light in the card on tap.
- Tiles show friendly name, on/off status, and brightness when on. On-state uses a warm-white accent (`#f5c842`).
- Tap a tile to toggle. Long-press (500 ms) a tile to open Home Assistant's more-info dialog.
- Per-tile layout: `columns: 1` (default) is full-width, `columns: 2` is half-width.
- Adaptive theming — uses Home Assistant CSS variables so it follows your current theme.
- Pure TypeScript + Lit, no external runtime dependencies beyond `lit` and `custom-card-helpers`.

## Installation

### HACS (recommended)

1. Add this repository as a Custom Repository in HACS (type: **Dashboard**).
2. Install **Room Lights Card**.
3. Refresh your browser (Ctrl/Cmd + Shift + R).

### Manual

1. Copy `dist/room-lights-card.js` into your Home Assistant `config/www/` directory.
2. Add a resource entry in your dashboard:
   - URL: `/local/room-lights-card.js`
   - Type: `JavaScript Module`
3. Refresh your browser.

## Configuration

### Visual Editor

After installation, pick "Room Lights Card" when adding a card. Give it a name and add your light entities.

### YAML

```yaml
type: custom:room-lights-card
name: Living Room
room_off: group.living_room_lights   # optional
entities:
  - entity: light.chandelier
    columns: 1
  - entity: light.corner_lamp
    name: Corner Lamp                 # optional, overrides friendly_name
    icon: mdi:lamp                    # optional, fixed regardless of on/off
    columns: 2
  - entity: light.floor_lamp
    columns: 2
```

## Options

| Name       | Type   | Required | Description                                                                          |
| ---------- | ------ | -------- | ------------------------------------------------------------------------------------ |
| `type`     | string | yes      | `custom:room-lights-card`                                                            |
| `name`     | string | yes      | Display name shown in the card header.                                               |
| `entities` | array  | yes      | List of light/switch entities to control. See [Entity options](#entity-options).     |
| `room_off` | string | no       | Master target for the header tap. When set, tapping the header toggles THIS entity (a `light.*`, `group.*`, or `switch.*`) instead of every tile at once. Tile entities remain individually toggleable. Useful with a HA light group (e.g. `group.living_room_lights`) so the header represents the whole room while the tiles show a curated subset. |

## Entity options

| Key       | Type       | Default        | Description                                                                                                                |
| --------- | ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `entity`  | string     | —              | A `light.*` or `switch.*` entity id.                                                                                       |
| `columns` | `1` \| `2` | `1`            | `1` = full-width, `2` = half-width.                                                                                        |
| `name`    | string     | friendly_name  | Optional display name override. When set, used as the tile label instead of the entity's `friendly_name` (or entity_id). |
| `icon`    | string     | entity's icon  | Optional MDI icon override (e.g. `mdi:lamp`). When set, the icon is fixed regardless of on/off state. When unset, the icon tracks the entity's state. |

## Behavior

- **Tap a tile** — toggles that light.
- **Long-press a tile (500 ms)** — opens the Home Assistant more-info dialog for that light.
- **Tap the header** — toggles every light in the card at once.
- If a light entity is `unavailable` or `unknown`, the tile is shown dimmed and taps do nothing for that tile (HASS itself reports the service error).
- Brightness percentage is shown when the light is on and reports a `brightness` attribute.

## Development

```bash
npm install
npm start          # rollup --watch (rebuild on src change)
npm run build      # one-shot production build to dist/
npm test           # vitest run (utils)
npm run test:watch # vitest in watch mode
```

The build output is `dist/room-lights-card.js`.

## License

MIT
