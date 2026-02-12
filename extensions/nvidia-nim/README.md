# Nvidia NIM Extension

Authenticate and configure the Nvidia NIM provider for the Pi coding agent. Models you add appear directly in the `/model` picker.

## Commands

| Command | Description |
|---------|-------------|
| `/nvidia-nim-auth` | Full setup — API key + model editor |
| `/nvidia-auth` | Alias for `/nvidia-nim-auth` |
| `/nvidia-nim-models` | Add/edit models (keeps existing API key) |

## Usage

1. **Get an API key** from [build.nvidia.com](https://build.nvidia.com)
2. Run `/nvidia-nim-auth` in Pi
3. Paste your `nvapi-...` key
4. Add model IDs in the editor (one per line), e.g.:
   ```
   meta/llama-3.1-405b-instruct
   deepseek-ai/deepseek-r1
   moonshotai/kimi-k2.5
   nvidia/llama-3.1-nemotron-70b-instruct
   ```
5. Use `/model` to switch to any registered Nvidia model (also available in scoped model list / Ctrl+P cycling)

To add more models later without re-entering your key, use `/nvidia-nim-models`.

### Model ID format

Model IDs must be `org/model` (exactly one `/`).

✅ Valid:
- `moonshotai/kimi-k2.5`
- `nvidia/llama-3.1-nemotron-70b-instruct`

❌ Invalid:
- `nvidia/moonshotai/kimi-k2.5` (this is provider + org + model)

Invalid lines are ignored during parsing.

## Configuration

Config is saved to `~/.pi/nvidia-nim.json`:

```json
{
  "apiKey": "nvapi-...",
  "models": [
    { "id": "meta/llama-3.1-405b-instruct", "name": "Llama 3.1 405b Instruct", "reasoning": false },
    { "id": "deepseek-ai/deepseek-r1", "name": "Deepseek R1", "reasoning": true }
  ]
}
```

Models are registered via `pi.registerProvider()` on startup and after auth, so they show up in `/model` immediately.

The extension also updates `~/.pi/agent/settings.json` `enabledModels` entries for provider `nvidia`, so configured models appear in scoped `/model` and Ctrl+P cycling.

## Browse Models

See all available Nvidia NIM models at: [build.nvidia.com/models](https://build.nvidia.com/models)
