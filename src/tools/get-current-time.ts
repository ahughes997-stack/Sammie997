import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

export interface ToolDefinition {
    spec: ChatCompletionTool;
    execute: (input: Record<string, unknown>) => Promise<string>;
}

export const getCurrentTimeTool: ToolDefinition = {
    spec: {
        type: "function",
        function: {
            name: "get_current_time",
            description:
                "Get the current date and time in the user's local timezone. Use this whenever the user asks about the current time, date, or day.",
            parameters: {
                type: "object",
                properties: {
                    timezone: {
                        type: "string",
                        description:
                            'IANA timezone string (e.g. "America/New_York"). Defaults to system timezone if omitted.',
                    },
                },
                required: [],
            },
        },
    },

    async execute(input: Record<string, unknown>): Promise<string> {
        const tz = (input.timezone as string) || undefined;

        try {
            const now = new Date();
            const formatted = now.toLocaleString("en-US", {
                timeZone: tz,
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "short",
            });

            return JSON.stringify({
                formatted,
                iso: now.toISOString(),
                unix: Math.floor(now.getTime() / 1000),
            });
        } catch {
            return JSON.stringify({ error: `Invalid timezone: ${tz}` });
        }
    },
};
