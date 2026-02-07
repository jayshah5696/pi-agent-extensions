import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BOLLYWOOD_MESSAGES, CONTEXT_MESSAGES, PI_TIPS, WHIMSICAL_VERBS, GOODBYE_MESSAGES } from "./messages.js";

type WhimsyMode = 'chaos' | 'classic' | 'bollywood' | 'geek';

interface WhimsyState {
  mode: WhimsyMode;
  enabled: boolean;
}

const state: WhimsyState = {
  mode: 'chaos', // Default: The mix you requested
  enabled: true,
};

function getTimeContext(): 'morning' | 'night' | 'day' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 0 && hour < 4) return 'night';
  return 'day';
}

function pickMessage(mode: WhimsyMode, durationSeconds: number = 0): string {
  // 1. Check for Long Wait (Overrides everything else if waiting > 5s)
  if (durationSeconds > 5 && Math.random() > 0.5) {
     const longMsgs = CONTEXT_MESSAGES.longWait;
     return longMsgs[Math.floor(Math.random() * longMsgs.length)];
  }

  // 2. Check for Time Context (Morning/Night special messages)
  const timeContext = getTimeContext();
  if (timeContext !== 'day' && Math.random() > 0.7) {
    const timeMsgs = CONTEXT_MESSAGES[timeContext];
    return timeMsgs[Math.floor(Math.random() * timeMsgs.length)];
  }

  // 3. Mode-based Selection
  if (mode === 'classic') {
    return WHIMSICAL_VERBS[Math.floor(Math.random() * WHIMSICAL_VERBS.length)];
  }
  
  if (mode === 'bollywood') {
    return BOLLYWOOD_MESSAGES[Math.floor(Math.random() * BOLLYWOOD_MESSAGES.length)];
  }
  
  if (mode === 'geek') {
    // Re-use gerunds + tips for now as "geek" substitute + some custom logic could go here
    return PI_TIPS[Math.floor(Math.random() * PI_TIPS.length)]; 
  }

  // CHAOS MODE (The requested 50/30/20 mix)
  const roll = Math.random();
  
  if (roll < 0.5) { 
    // 50% Bollywood
    return BOLLYWOOD_MESSAGES[Math.floor(Math.random() * BOLLYWOOD_MESSAGES.length)];
  } else if (roll < 0.8) { 
    // 30% Tips
    return PI_TIPS[Math.floor(Math.random() * PI_TIPS.length)];
  } else { 
    // 20% Classic/Smart (Gerunds or Context)
    return WHIMSICAL_VERBS[Math.floor(Math.random() * WHIMSICAL_VERBS.length)];
  }
}

export default function (pi: ExtensionAPI) {
  // Register Command
  pi.registerCommand("whimsy", {
    description: "Configure whimsical loading messages",
    handler: async (args) => {
      const subCommand = args[0];
      if (subCommand === 'off') {
        state.enabled = false;
        return "Whimsical messages disabled.";
      }
      if (subCommand === 'on') {
        state.enabled = true;
        return "Whimsical messages enabled.";
      }
      if (['chaos', 'classic', 'bollywood', 'geek'].includes(subCommand)) {
        state.mode = subCommand as WhimsyMode;
        return `Whimsy mode set to: ${state.mode}`;
      }
      return "Usage: /whimsy [chaos|classic|bollywood|geek|on|off]";
    }
  });

  // Register /exit and /bye
  pi.registerCommand("exit", {
    description: "Exit Pi with a whimsical goodbye",
    handler: async (_args, ctx) => {
      const msg = GOODBYE_MESSAGES[Math.floor(Math.random() * GOODBYE_MESSAGES.length)];
      if (ctx.hasUI) {
        ctx.ui.notify(`👋 ${msg}`, "info");
      }
      // Use setImmediate to ensure shutdown happens after command handler completes
      setImmediate(() => ctx.shutdown());
    },
  });

  pi.registerCommand("bye", {
    description: "Exit Pi with a whimsical goodbye (alias)",
    handler: async (_args, ctx) => {
      const msg = GOODBYE_MESSAGES[Math.floor(Math.random() * GOODBYE_MESSAGES.length)];
      if (ctx.hasUI) {
        ctx.ui.notify(`👋 ${msg}`, "info");
      }
      // Use setImmediate to ensure shutdown happens after command handler completes
      setImmediate(() => ctx.shutdown());
    },
  });

  // Turn Start Logic
  pi.on("turn_start", async (_event, ctx) => {
    if (!state.enabled) return;

    // Initial Message
    ctx.ui.setWorkingMessage(pickMessage(state.mode));

    // Dynamic Updates for Long Turns
    const startTime = Date.now();
    // Update every 10 seconds to give time to read long messages
    const interval = setInterval(() => {
      if (!state.enabled) {
        clearInterval(interval);
        return;
      }
      
      const elapsed = (Date.now() - startTime) / 1000;
      ctx.ui.setWorkingMessage(pickMessage(state.mode, elapsed));
    }, 10000);

    // Store interval in a weak map or similar if we needed to clear it externally, 
    // but turn_end is sufficient.
    (ctx as any)._whimsyInterval = interval;
  });

  // Turn End Logic
  pi.on("turn_end", async (_event, ctx) => {
    ctx.ui.setWorkingMessage(); // Reset
    if ((ctx as any)._whimsyInterval) {
      clearInterval((ctx as any)._whimsyInterval);
    }
  });
}
