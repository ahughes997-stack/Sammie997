import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { getCurrentTimeTool, type ToolDefinition } from "./get-current-time.js";
import { rememberTool, executeRemember } from "./remember.js";
import { recallTool, executeRecall } from "./recall.js";
import { webSearchTool, executeWebSearch } from "./web-search.js";

// ── Tool Registry ──────────────────────────────────────────────
// Add new tools here. The agent loop uses this to resolve tool calls.

const allTools: ToolDefinition[] = [
    getCurrentTimeTool,
    {
        spec: rememberTool,
        execute: async (args) =>
            executeRemember(args as { content: string; category: string }),
    },
    {
        spec: recallTool,
        execute: async (args) => executeRecall(args as { query: string }),
    },
    {
        spec: webSearchTool,
        execute: async (args) =>
            executeWebSearch(args as { query: string; num_results?: number }),
    },
];

/** Tool specs to pass to the LLM */
export const toolSpecs: ChatCompletionTool[] = allTools.map((t) => t.spec);

/** Lookup map: tool name → execute function */
const toolMap = new Map<string, ToolDefinition["execute"]>(
    allTools.map((t) => [t.spec.function.name, t.execute])
);

/** Execute a tool by name. Returns error JSON if tool not found. */
export async function executeTool(
    name: string,
    input: Record<string, unknown>
): Promise<string> {
    const fn = toolMap.get(name);
    if (!fn) {
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
    return fn(input);
}
