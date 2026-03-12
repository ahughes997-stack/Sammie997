import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import { getCurrentTimeTool, type ToolDefinition } from "./get-current-time.js";
import { rememberTool, executeRemember } from "./remember.js";
import { recallTool, executeRecall } from "./recall.js";
import { webSearchTool, executeWebSearch } from "./web-search.js";
import {
    listGmailMessagesTool,
    executeListGmailMessages,
    getGmailMessageTool,
    executeGetGmailMessage,
    sendGmailMessageTool,
    executeSendGmailMessage,
    createGmailDraftTool,
    executeCreateGmailDraft,
    diagnoseGmailTool,
    executeDiagnoseGmail,
} from "./gmail.js";
import {
    listTodoistTasksTool,
    executeListTodoistTasks,
    addTodoistTaskTool,
    executeAddTodoistTask,
    completeTodoistTaskTool,
    executeCompleteTodoistTask,
} from "./todoist.js";

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
    {
        spec: listGmailMessagesTool,
        execute: async (args) =>
            executeListGmailMessages(args as { query?: string; maxResults?: number }),
    },
    {
        spec: getGmailMessageTool,
        execute: async (args) =>
            executeGetGmailMessage(args as { messageId: string }),
    },
    {
        spec: sendGmailMessageTool,
        execute: async (args) =>
            executeSendGmailMessage(args as { to: string; subject: string; body: string }),
    },
    {
        spec: createGmailDraftTool,
        execute: async (args) =>
            executeCreateGmailDraft(args as { to: string; subject: string; body: string }),
    },
    {
        spec: diagnoseGmailTool,
        execute: async () => executeDiagnoseGmail(),
    },
    {
        spec: listTodoistTasksTool,
        execute: async (args) => executeListTodoistTasks(args as { filter?: string }),
    },
    {
        spec: addTodoistTaskTool,
        execute: async (args) =>
            executeAddTodoistTask(args as { content: string; dueString?: string; priority?: number }),
    },
    {
        spec: completeTodoistTaskTool,
        execute: async (args) => executeCompleteTodoistTask(args as { taskId: string }),
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
