# Nvidia NIM Extension

This extension allows you to authenticate and configure the Nvidia NIM provider for the Pi coding agent.

## Commands

- `/nvidia-nim-auth`: Prompts for your Nvidia NIM API Key and configures the provider in `~/.pi/settings.json`.
- `/nvidia-auth`: Alias for `/nvidia-nim-auth`.

## Configuration

The extension updates your `~/.pi/settings.json` file with the following configuration:

```json
{
  "providers": {
    "nvidia": {
      "type": "openai",
      "baseUrl": "https://integrate.api.nvidia.com/v1",
      "apiKey": "YOUR_API_KEY",
      "models": ["meta/llama-3.1-405b-instruct"]
    }
  }
}
```

Once configured, you can switch to Nvidia NIM models using the `/model` command (e.g., `/model meta/llama-3.1-405b-instruct`).
