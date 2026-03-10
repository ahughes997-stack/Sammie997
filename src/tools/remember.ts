import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { saveMemory } from "../memory/db.js";

export const rememberTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "remember",
        description:
            "Explicitly save something to long-term memory. Use when the user asks you to remember something, or when you encounter important information worth storing. Categories: personal, preference, plan, fact, instruction.",
        parameters: {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "The fact or information to remember",
                },
                category: {
                    type: "string",
                    enum: ["personal", "preference", "plan", "fact", "instruction"],
                    description: "Category of the memory",
                },
            },
            required: ["content", "category"],
        },
    },
};

export function executeRemember(args: {
    content: string;
    category: string;
}): string {
    const id = saveMemory(args.content, args.category, "explicit");
    console.log(`  💾 Explicit memory saved [${args.category}]: ${args.content}`);
    return JSON.stringify({
        success: true,
        id,
        message: `Remembered: "${args.content}"`,
    });
}
