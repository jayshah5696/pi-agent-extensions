# Whimsical Extension

A personality engine for the [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). Adds delightful, context-aware, and humorous loading messages to make waiting for the LLM less boring.

## Features

- **Context-Aware Loading Messages**: Messages change based on time of day (Morning/Night) and how long the task is taking.
- **Multiple Personality Modes**: Choose your vibe, from Bollywood drama to Geek humor.
- **Smart Exit**: Adds `/exit` and `/bye` commands that perform a graceful shutdown with a whimsical goodbye message (and ensure your terminal is left clean!).
- **Helpful Tips**: Occasionally shows useful Pi usage tips while you wait.

## Usage

The extension activates automatically. You can configure it using the `/whimsy` command.

### Commands

| Command | Description |
|---------|-------------|
| `/whimsy` | Check current status and usage. |
| `/whimsy <mode>` | Switch mode (chaos, bollywood, geek, classic). |
| `/whimsy on` | Enable whimsical messages. |
| `/whimsy off` | Disable (revert to standard "Thinking..." messages). |
| `/exit` | Exit Pi gracefully with a random goodbye message. |
| `/bye` | Alias for `/exit`. |

### Modes

- **`chaos` (Default)**: A curated mix of everything!
  - 50% Bollywood/Hinglish
  - 30% Helpful Tips
  - 20% Sci-Fi/Classic Gerunds
- **`bollywood`**: 100% Bollywood dialogues and Hinglish developer memes.
  - *"Picture abhi baaki hai mere dost..."*
  - *"Tareekh pe tareekh..."*
- **`geek`**: Sci-Fi, Cyberpunk, and Developer humor.
  - *"Reticulating splines..."*
  - *"Downloading more RAM..."*
- **`classic`**: Simple, whimsical verbs (Claude-style).
  - *"Schlepping..."*, *"Combobulating..."*

## Examples

**Long Wait (Story Mode):**
If a task takes longer than 5 seconds, the message changes to reassure you:
> "Abhi hum zinda hain!" (We are still alive!)
> "Sabar ka phal meetha hota hai..." (Patience pays off...)

**Late Night (12 AM - 4 AM):**
> "Soja beta, varna Gabbar aa jayega..."
> "Burning the midnight oil..."

## Installation

Included in `pi-agent-extensions`.

```bash
pi install npm:pi-agent-extensions
```
