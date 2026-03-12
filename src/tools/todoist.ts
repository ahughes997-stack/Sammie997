import { TodoistApi } from "@doist/todoist-api-typescript";
import { loadConfig } from "../config.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

function getTodoistApi() {
    const config = loadConfig();
    if (!config.todoistToken) {
        throw new Error("Missing TODOIST_TOKEN in configuration. Please provide your API token.");
    }
    return new TodoistApi(config.todoistToken);
}

// ── Diagnose Todoist ─────────────────────────────────────────────
export const diagnoseTodoistTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "diagnose_todoist",
        description: "Check Todoist authentication status and verify API connectivity.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
};

export async function executeDiagnoseTodoist(): Promise<string> {
    try {
        const api = getTodoistApi();
        console.log("🔍 [DIAGNOSE_TODOIST] Attempting to fetch projects...");
        const projects = (await api.getProjects() as unknown) as any[];
        return JSON.stringify({
            status: "success",
            message: "Successfully connected to Todoist API",
            projectCount: projects.length,
            projects: projects.map((p: any) => ({ id: p.id, name: p.name }))
        });
    } catch (error: any) {
        console.error("❌ [DIAGNOSE_TODOIST] Error:", error.message);
        return JSON.stringify({
            status: "error",
            message: error.message,
            suggestion: "Check your TODOIST_TOKEN in Railway settings."
        });
    }
}

// ── List Tasks ──────────────────────────────────────────────────
export const listTodoistTasksTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "list_todoist_tasks",
        description: "List active tasks from Todoist.",
        parameters: {
            type: "object",
            properties: {
                filter: {
                    type: "string",
                    description: "Optional filter (e.g., 'today', 'overdue').",
                },
            },
        },
    },
};

export async function executeListTodoistTasks(args: { filter?: string }): Promise<string> {
    console.log("🛠️ [TODOIST_TOOL] list_todoist_tasks", args);
    try {
        const api = getTodoistApi();
        // The SDK might expect no args or different args depending on version.
        // Let's try passing it correctly and casting if needed.
        const tasks = (await api.getTasks(args as any) as unknown) as any[];

        if (!Array.isArray(tasks) || tasks.length === 0) {
            return "No active tasks found.";
        }

        return JSON.stringify((tasks as any[]).map(t => ({
            id: t.id,
            content: t.content,
            due: t.due?.string || "No due date",
            isOverdue: t.due?.date ? new Date(t.due.date) < new Date() : false,
            priority: t.priority,
            url: t.url
        })), null, 2);
    } catch (error: any) {
        return `Error listing tasks: ${error.message}`;
    }
}

// ── Add Task ────────────────────────────────────────────────────
export const addTodoistTaskTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "add_todoist_task",
        description: "Create a new task in Todoist.",
        parameters: {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "The text of the task.",
                },
                dueString: {
                    type: "string",
                    description: "Optional due date (e.g., 'tomorrow', 'next Monday', '2023-12-31').",
                },
                priority: {
                    type: "number",
                    description: "Priority from 1 (normal) to 4 (urgent).",
                },
            },
            required: ["content"],
        },
    },
};

export async function executeAddTodoistTask(args: {
    content: string;
    dueString?: string;
    priority?: number;
}): Promise<string> {
    console.log("🛠️ [TODOIST_TOOL] add_todoist_task", args);
    try {
        const api = getTodoistApi();
        const task = await api.addTask({
            content: args.content,
            dueString: args.dueString,
            priority: args.priority,
        });
        console.log(`✅ [TODOIST_TOOL] Task created: ${task.id}`);

        return `Task created successfully: ${task.content} (ID: ${task.id})`;
    } catch (error: any) {
        return `Error adding task: ${error.message}`;
    }
}

// ── Complete Task ───────────────────────────────────────────────
export const completeTodoistTaskTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "complete_todoist_task",
        description: "Mark a Todoist task as completed.",
        parameters: {
            type: "object",
            properties: {
                taskId: {
                    type: "string",
                    description: "The ID of the task to complete.",
                },
            },
            required: ["taskId"],
        },
    },
};

export async function executeCompleteTodoistTask(args: { taskId: string }): Promise<string> {
    console.log("🛠️ [TODOIST_TOOL] complete_todoist_task", args);
    try {
        const api = getTodoistApi();
        await api.closeTask(args.taskId);
        console.log(`✅ [TODOIST_TOOL] Task completed: ${args.taskId}`);
        return `Task ${args.taskId} marked as completed.`;
    } catch (error: any) {
        return `Error completing task: ${error.message}`;
    }
}
