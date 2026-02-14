# Whimsical Extension (Chaos Mixer)

A stupid, nerdy, fun, Bollywood-infused loading-message extension for Pi.

## What changed

Older separate modes (`classic`, `bollywood`, `geek`) are replaced by one chaos mixer with 7 weighted buckets:

- **A**: Absurd Nerd Lines — grepping the void, refactoring by vibes
- **B**: Boss Progression — phase-based messages by wait duration
- **C**: Fake Compiler Panic — chaotic fake diagnostics
- **D**: Terminal Meme Lines — CLI one-liners and git jokes
- **E**: Bollywood & Hinglish — classic dialogues, movie vibes, desi dev humor
- **F**: Whimsical Verbs — Combobulating... Skedaddling... Noodling...
- **G**: Pi Tips — helpful tips for using Pi effectively

Default split is `A=10 / B=10 / C=10 / D=10 / E=30 / F=15 / G=15` (Bollywood-heavy by default).

Context-aware overrides still apply: morning messages (5-11 AM), late night messages (12-4 AM), and long-wait reassurance (>5s).

## Commands

| Command | Description |
|---|---|
| `/whimsy` | Open interactive percentage tuner window |
| `/whimsy on` | Enable whimsical messages |
| `/whimsy off` | Disable whimsical messages |
| `/whimsy status` | Show enabled state + current percentages + spinner preset |
| `/whimsy reset` | Reset to default weights + default spinner preset |
| `/exit` | Exit Pi with a weighted goodbye (uses current bucket percentages) |
| `/bye` | Alias for `/exit` |

## Interactive tuner behavior

When you run `/whimsy`, you get a window where:

- a live spinner preview is shown using the current weights
- preview spinner animates at real-turn cadence and preview message rotates every 10 seconds

- `↑ / ↓` moves between A-G rows and the spinner row at the bottom
- `← / →` adjusts the selected bucket by **5** (or switches spinner preset when spinner row is selected)
- spinner row shows a small frame sample next to each preset name
- `Enter` saves **only if total = 100**
- `Esc` cancels

Totals are allowed to go below/above 100 while tuning, but save is blocked until total is exactly 100. A warning is shown at the bottom when invalid.

Spinner presets included: Sleek Orbit, Neon Pulse, Scanline, Chevron Flow, Matrix Glyph.

Selected spinner preset is applied to Pi's live loader spinner (not just preview).

Goodbye messages also use A-G bucketed pools and follow the same weighted split.

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
      "A": 10,
      "B": 10,
      "C": 10,
      "D": 10,
      "E": 30,
      "F": 15,
      "G": 15
    },
    "spinnerPreset": "sleekOrbit"
  }
}
```
