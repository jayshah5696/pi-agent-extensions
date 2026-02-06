# Pi Coding Agent - Vertex AI Setup

This document covers how to use Pi coding agent with Google Cloud Vertex AI models, including both Gemini and Anthropic Claude models.

## Prerequisites

- Google Cloud project with Vertex AI API enabled
- Service account key or Application Default Credentials (ADC)
- Models enabled in Vertex AI Model Garden

## Environment Variables

Add these to your `.zshrc` or `.bashrc`:

```bash
# Google Cloud credentials
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.gcp/vertex_key.json"
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_CLOUD_LOCATION="us-central1"  # or us-east5 for Claude models
```

## Available Providers

### 1. Google Vertex (Gemini Models) ✅ Working

Pi has built-in support for Gemini models on Vertex AI.

```bash
# List available Vertex models
pi --list-models vertex

# Use Gemini 2.5 Flash
pi --provider google-vertex --model gemini-2.5-flash

# Use Gemini 2.5 Pro
pi --provider google-vertex --model gemini-2.5-pro

# Use Gemini 3 (if available in your region)
pi --provider google-vertex --model gemini-3-pro-preview
```

**Tested working models:**
- `gemini-2.5-flash` (us-central1)
- `gemini-2.5-pro` (us-central1)
- `gemini-2.0-flash` (us-central1)

**Note:** Gemini 3 preview models may require specific regions or project enablement.

### 2. Anthropic Claude on Vertex AI ❌ Not Yet Supported

As of February 2026, Pi does **not** have built-in support for Anthropic Claude models on Vertex AI.

**Status:** PR #1157 is open to add `anthropic-vertex` provider:
https://github.com/badlogic/pi-mono/pull/1157

**Workarounds:**

#### Option A: Use Google Antigravity (Free tier with rate limits)
```bash
pi --provider google-antigravity --model claude-opus-4-5-thinking
# Run /login and select Google Antigravity
```

#### Option B: Install from PR branch (experimental)
```bash
npm install -g github:michaelpersonal/pi-mono#feat/anthropic-vertex-provider
pi --provider anthropic-vertex --model claude-opus-4-5@20251101
```

#### Option C: Use Claude Code directly
Claude Code has native Vertex AI support:
```bash
export CLAUDE_CODE_USE_VERTEX=1
export CLOUD_ML_REGION=us-east5
export ANTHROPIC_VERTEX_PROJECT_ID="your-project-id"
claude
```

## Claude Models on Vertex AI (for reference)

Once PR #1157 is merged, these models will be available:

| Model | Vertex AI Model ID | Region |
|-------|-------------------|--------|
| Claude Opus 4.5 | `claude-opus-4-5@20251101` | us-east5, europe-west1, asia-southeast1, global |
| Claude Sonnet 4.5 | `claude-sonnet-4-5@20250514` | us-east5, europe-west1, asia-southeast1, global |
| Claude Sonnet 4 | `claude-sonnet-4@20250514` | us-east5, europe-west1, asia-southeast1, global |
| Claude Haiku 4.5 | `claude-haiku-4-5@20241022` | us-east5, europe-west1, asia-southeast1, global |

## Region Considerations

- **Gemini models:** Work best with `us-central1`
- **Claude models:** Available in `us-east5`, `europe-west1`, `asia-southeast1`, or `global`
- Using `global` endpoint provides automatic routing to available regions

## Troubleshooting

### Model not found error
```
Publisher Model was not found or your project does not have access
```
- Check the model is enabled in your project's Model Garden
- Try a different region (e.g., `us-central1` for Gemini)

### Authentication errors
- Run `gcloud auth application-default login` for ADC
- Or ensure `GOOGLE_APPLICATION_CREDENTIALS` points to valid service account key
- Verify service account has `Vertex AI User` role

### Rate limiting
- Vertex AI has per-region quotas
- Consider using `global` endpoint for Claude models for better availability

## Related Tools Configuration

### OpenCode
```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.gcp/vertex_key.json"
export GOOGLE_CLOUD_PROJECT="your-project-id"
```

### Claude Code
```bash
export CLAUDE_CODE_USE_VERTEX=1
export CLOUD_ML_REGION=us-east5
export ANTHROPIC_VERTEX_PROJECT_ID="your-project-id"
```

## References

- [Pi Coding Agent GitHub](https://github.com/badlogic/pi-mono)
- [Pi Providers Documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/providers.md)
- [Anthropic Vertex PR #1157](https://github.com/badlogic/pi-mono/pull/1157)
- [Google Cloud Vertex AI Claude Docs](https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/claude)
- [Vertex AI Authentication](https://docs.cloud.google.com/vertex-ai/docs/authentication)
