import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { AskUserParams, type AskUserDetails, type AskUserResult } from "./types.js";
import { executeAskUser } from "./tool.js";

export default function askUserExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description: `Ask the user one or more questions. Use when you need:
- Clarification on requirements or preferences
- User decisions between multiple valid approaches
- Confirmation before significant changes
- Input that cannot be inferred from context

Each question can have suggested options with descriptions.
Users can always select "Other" to provide a custom answer.
In non-interactive mode, creates a pending questions file for async response.

Guidelines:
- Put recommended option first with "(Recommended)" in the label
- Batch related questions together (avoid multiple rounds)
- Limit to 3-5 questions per call to avoid user fatigue
- Don't ask what can be inferred from context or previous messages
- Don't re-ask questions already answered in this session`,

    parameters: AskUserParams,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result: AskUserResult = await executeAskUser(params, ctx);

      // Build tool result details for session storage
      const details: AskUserDetails = {
        questions: params.questions,
        answers: result.answers,
        answeredAt: Date.now(),
        mode: ctx.hasUI ? "interactive" : "print",
        metadata: params.metadata,
      };

      // Build content text
      let contentText = "";

      if (result.answered) {
        // Success - show answers
        contentText = result.answers
          .map((a, i) => {
            const prefix = `Q${i + 1}: ${a.question}\nA${i + 1}: `;
            if (a.wasCustom) {
              return prefix + `(custom) ${a.answer}`;
            }
            return prefix + a.answer;
          })
          .join("\n\n");
      } else if (result.pendingFile) {
        // Print mode - pending file created
        contentText = `Questions pending. User input required.

To answer, re-run with:
  pi -p @${result.pendingFile} "your answers"

Or edit the JSON file and run:
  pi -c

Questions saved to: ${result.pendingFile}`;
      } else {
        // Cancelled
        contentText = "User cancelled the questions.";
      }

      return {
        content: [{ type: "text", text: contentText }],
        details,
      };
    },

    renderCall(args, theme) {
      const params = args as { questions?: unknown[] };
      const count = params.questions?.length || 0;
      let text = theme.fg("toolTitle", theme.bold("ask_user "));
      text += theme.fg("muted", `${count} question${count !== 1 ? "s" : ""}`);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as AskUserDetails | undefined;

      if (!details || details.answers.length === 0) {
        return new Text(theme.fg("warning", "Cancelled or pending"), 0, 0);
      }

      // Show summary of answers
      const lines = details.answers.map((a) => {
        const icon = a.wasCustom ? "✎" : "✓";
        const prefix = theme.fg("success", `${icon} `);
        const answer = Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;
        return prefix + theme.fg("text", answer);
      });

      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
