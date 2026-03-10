import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { searchMemories, getAllMemories } from "../memory/db.js";

export const recallTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "recall",
        description:
            "Search your long-term memory for information about the user or past conversations. Use when you need to look up something specific the user told you before, or when they ask 'do you remember...'",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description:
                        "Keywords to search for in memories (e.g., 'dog name', 'favorite color', 'work project')",
                },
            },
            required: ["query"],
        },
    },
};

export function executeRecall(args: { query: string }): string {
    try {
        // Build FTS5-safe query
        const words = args.query
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 2);

        let results;
        if (words.length === 0) {
            // If no meaningful keywords, return all recent memories
            results = getAllMemories().slice(0, 10);
        } else {
            const ftsQuery = words.map((w) => `"${w}"`).join(" OR ");
            results = searchMemories(ftsQuery, 10);
        }

        if (results.length === 0) {
            return JSON.stringify({
                found: false,
                message: "No memories found matching that query.",
            });
        }

        return JSON.stringify({
            found: true,
            count: results.length,
            memories: results.map((m) => ({
                content: m.content,
                category: m.category,
                stored_at: m.created_at,
            })),
        });
    } catch (error) {
        return JSON.stringify({
            found: false,
            message: "Memory search encountered an error.",
        });
    }
}
