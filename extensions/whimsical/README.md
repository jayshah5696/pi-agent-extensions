# Whimsical Extension (Chaos Mixer)

A stupid, nerdy, fun loading-message extension for Pi.

## What changed

Older modes were removed (`classic`, `bollywood`, `geek`).
Now there is one chaos mixer with 4 buckets:

- **A**: Absurd Nerd Lines
- **B**: Boss Progression (phase-based by wait time)
- **C**: Fake Compiler Panic
- **D**: Terminal Meme Lines

Default split is `25 / 25 / 25 / 25`.

## Commands

| Command | Description |
|---|---|
| `/whimsy` | Open interactive percentage tuner window |
| `/whimsy on` | Enable whimsical messages |
| `/whimsy off` | Disable whimsical messages |
| `/whimsy status` | Show enabled state + current percentages + spinner preset |
| `/whimsy reset` | Reset to `25/25/25/25` + default spinner preset |
| `/exit` | Exit Pi with a weighted goodbye (uses current A/B/C/D percentages) |
| `/bye` | Alias for `/exit` |

## Interactive tuner behavior

When you run `/whimsy`, you get a window where:

- a live spinner preview is shown using the current weights
- preview spinner animates at real-turn cadence and preview message rotates every 10 seconds

- `↑ / ↓` moves between A/B/C/D rows and the spinner row at the bottom
- `← / →` adjusts the selected bucket by **5** (or switches spinner preset when spinner row is selected)
- spinner row shows a small frame sample next to each preset name
- `Enter` saves **only if total = 100**
- `Esc` cancels

Totals are allowed to go below/above 100 while tuning, but save is blocked until total is exactly 100. A warning is shown at the bottom when invalid.

Spinner presets included: Sleek Orbit, Neon Pulse, Scanline, Chevron Flow, Matrix Glyph.

Selected spinner preset is applied to Pi's live loader spinner (not just preview).

Goodbye messages now also use A/B/C/D bucketed pools and follow the same weighted split.

## Persistence

Settings persist globally in:

- `~/.pi/agent/settings.json` under the `whimsical` key

No local project settings are used for whimsy anymore.

Example:

```json
{
  "whimsical": {
    "enabled": true,
    "weights": {
      "A": 25,
      "B": 25,
      "C": 25,
      "D": 25
    },
    "spinnerPreset": "sleekOrbit"
  }
}
```
