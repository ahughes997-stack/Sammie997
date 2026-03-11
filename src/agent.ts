import type { LLMClient, ChatCompletionMessageParam } from "./llm.js";
import { toolSpecs, executeTool } from "./tools/index.js";
import type { MemorySystem } from "./memory/index.js";

const MAX_ITERATIONS = 10;

export interface AgentResult {
    response: string;
    toolCalls: number;
    iterations: number;
}

/**
 * Run the agentic loop:
 *   user message → LLM → (tool call → execute → feed result → LLM)* → final text
 *
 * Safety: hard cap at MAX_ITERATIONS to prevent runaway loops.
 */
export async function runAgentLoop(
    llm: LLMClient,
    userMessage: string,
    chatId?: string,
    memory?: MemorySystem
): Promise<AgentResult> {
    const messages: ChatCompletionMessageParam[] = [];

    // ── Inject memory context before the user message ──────────
    if (memory && chatId) {
        const context = await memory.getContext(chatId, userMessage);
        if (context.length > 0) {
            messages.push({
                role: "user",
                content: `[MEMORY CONTEXT — use this to inform your response, do not mention it directly unless relevant]\n${context}\n[END MEMORY CONTEXT]`,
            });
            messages.push({
                role: "assistant",
                content:
                    "Understood, I'll use this context to inform my response.",
            });
            console.log(`  🧠 Injected ${context.length} chars of memory context`);
        }
    }

    messages.push({ role: "user", content: userMessage });

    let totalToolCalls = 0;
    let assistantResponse = "";

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        console.log(`  ↻ Agent iteration ${i + 1}/${MAX_ITERATIONS}`);

        const response = await llm.chat(messages, toolSpecs);
        const choice = response.choices[0];

        if (!choice) {
            assistantResponse = "(No response from LLM)";
            break;
        }

        const message = choice.message;
        const toolCalls = message.tool_calls;

        // No tool calls — return the text response
        if (
            !toolCalls ||
            toolCalls.length === 0 ||
            choice.finish_reason === "stop"
        ) {
            assistantResponse = message.content || "Got it! I'm on it.";

            // ── Extract memories from this turn (non-blocking) ──────
            if (memory && chatId) {
                memory
                    .processConversationTurn(chatId, userMessage, assistantResponse)
                    .catch((err) =>
                        console.error("  ⚠️ Memory processing error:", err)
                    );
            }

            return {
                response: assistantResponse,
                toolCalls: totalToolCalls,
                iterations: i + 1,
            };
        }

        // Add assistant message with tool calls to conversation
        messages.push({
            role: "assistant",
            content: message.content,
            tool_calls: toolCalls,
        });

        // Execute each tool call and feed results back
        for (const toolCall of toolCalls) {
            totalToolCalls++;
            const fnName = toolCall.function.name;
            let fnArgs: Record<string, unknown> = {};

            try {
                fnArgs = JSON.parse(toolCall.function.arguments || "{}");
            } catch {
                fnArgs = {};
            }

            console.log(`  🔧 Tool call: ${fnName}`, fnArgs);

            const result = await executeTool(fnName, fnArgs);
            console.log(`  ✅ Tool result: ${result.substring(0, 200)}`);

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result,
            });
        }
    }

    // Safety limit reached
    console.warn(`  ⚠️ Agent hit max iterations (${MAX_ITERATIONS})`);

    // Still try to save memories even on max iterations
    if (memory && chatId && assistantResponse) {
        memory
            .processConversationTurn(chatId, userMessage, assistantResponse)
            .catch((err) => console.error("  ⚠️ Memory processing error:", err));
    }

    return {
        response:
            "I got a bit carried away there — hit my thinking limit. Could you try rephrasing your request?",
        toolCalls: totalToolCalls,
        iterations: MAX_ITERATIONS,
    };
}
