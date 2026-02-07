# Whimsical Extension Upgrade Proposal

## Overview
Transform the `whimsical` extension from a simple random message picker into a context-aware, configurable "personality engine" for the Pi coding agent. The goal is to make waiting times feel shorter and more delightful by providing varied, relevant, and sometimes helpful feedback.

## Core Features

### 1. Categorized Message Banks
Instead of a single flat list, messages will be organized into distinct categories:

*   **Gerunds (The "Claude" Style):** Single, delightful -ing verbs.
    *   *Examples:* "Schlepping...", "Combobulating...", "Flibbertigibbeting...", "Splines reticulating..."
*   **Sci-Fi / Technical:** Jargon-heavy, futuristic, or retro-tech phrases.
    *   *Examples:* "Reversing the polarity...", "Engaging warp drive...", "Defragging the matrix...", "Consulting the oracle..."
*   **Relatable / Dev Struggles:** Humorous takes on the developer experience.
    *   *Examples:* "Exiting Vim...", "Centering a div...", "Blaming the intern...", "It works on my machine..."
*   **Bollywood Masala (New!):** Iconic dialogues reimagined for coding.
    *   *Examples:*
        *   "Picture abhi baaki hai mere dost..." (The movie/loading isn't over yet)
        *   "Kitne bugs the?" (How many bugs were there?)
        *   "Mere Karan Arjun aayenge..." (My results will come...)
        *   "Ek semicolon ki keemat tum kya jaano..." (You don't know the value of one semicolon...)
        *   "Utha le re baba... mereko nahi, is bug ko!" (Pick it up oh god... not me, this bug!)
        *   "Risk hai toh ishq hai..." (If there's risk/bugs, there's love/dev)
*   **Helpful / Tips:** Occasional useful tips about Pi features.
    *   *Examples:* "Try /help for commands...", "Use /modes to switch models...", "Did you know? /diff shows changes..."

### 2. Context Awareness
*   **Time-of-Day:**
    *   *Morning (5 AM - 10 AM):* "Caffeinating...", "Waking up the pixels...", "Brewing logic..."
    *   *Late Night (12 AM - 4 AM):* "Burning the midnight oil...", "Compiling dream logic...", "Is it tomorrow yet?"
*   **Long Wait Logic:**
    *   If a turn takes > 5 seconds, switch from a simple "Thinking..." to a more elaborate "story" or a "self-deprecating" message ("Still thinking, I promise...", "Downloading more RAM...").

### 3. Configuration (Slash Command)
A new `/whimsy` command to control behavior:

*   `/whimsy mode <mode>`:
    *   `chaos`: (Default) Random mix of all categories (Gerunds 40%, SciFi 20%, Bollywood 30%, Tips 10%).
    *   `classic`: Only short Gerunds.
    *   `bollywood`: Only Bollywood dialogues.
    *   `geek`: Only Sci-Fi/Dev jokes.
*   `/whimsy level <0-10>`:
    *   `0`: Disable (Standard "Thinking..." only).
    *   `5`: Balanced (Mix of standard and whimsical).
    *   `10`: Maximum weirdness (Always show a whimsical message).

## Implementation Plan

1.  **Refactor `extensions/whimsical/index.ts`:**
    *   Create a `MessageManager` class to handle categories and logic.
    *   Implement `pickMessage()` with context awareness (time, duration).
    *   Add `setTimeout` loop to update message dynamically during long turns.

2.  **Add Configuration:**
    *   Register `/whimsy` command using `pi.registerCommand`.
    *   Persist settings to `workspaceState` or similar if available (or just runtime memory for v1).

3.  **Expand Message Library:**
    *   Curate the lists based on the research (Claude, Discord, Sims, etc.).

## Example "Story" Mode (Future)
*   "Planting seeds..." -> (2s later) -> "Watering..." -> (2s later) -> "Harvesting results!"
