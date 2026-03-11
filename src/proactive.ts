import type { LLMClient } from "./llm.js";
import {
    getRecentMessages,
    getAllMemories,
    saveRecommendation,
    getPendingRecommendations,
    StoredRecommendation
} from "./memory/db.js";

export class RecommendationEngine {
    constructor(private llm: LLMClient) { }

    /**
     * Analyze recent interactions to detect patterns and generate a proactive suggestion.
     */
    async analyzeAndSuggest(chatId: string): Promise<StoredRecommendation | null> {
        const recent = getRecentMessages(chatId, 15).reverse();
        const memories = getAllMemories();

        if (recent.length < 5) return null; // Not enough history to find patterns

        const historyText = recent
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n");

        const memoriesText = memories
            .map(m => `- [${m.category}] ${m.content}`)
            .join("\n");

        const prompt = `
You are the brain of Gravity Claw, an AI assistant. Your goal is to be PROACTIVE.
Analyze the user's recent conversation history and core memories to find a recurring pattern or a future need.

RECENT HISTORY:
${historyText}

CORE MEMORIES:
${memoriesText}

INSTRUCTIONS:
1. Identify a clear pattern (e.g., user often asks for X at this time, user is planning Y, user frequently checks Z).
2. If a strong pattern is found, generate a "Smart Recommendation".
3. A recommendation consists of:
   - A description of the pattern.
   - A friendly suggestion for the user.
   - A "suggested action" which is a tool call or a natural language command they might want you to run.
4. If no clear pattern or helpful suggestion is found, respond with "NO_PATTERN".

RESPONSE FORMAT (JSON):
{
  "pattern": "Brief description of the pattern",
  "suggestion": "Friendly proactive message to the user",
  "suggested_action": "Command or tool call",
  "confidence": 0.0 to 1.0
}
`;

        try {
            const response = await this.llm.chat([
                { role: "system", content: "You are a pattern analysis expert focused on proactive AI behavior." },
                { role: "user", content: prompt }
            ]);

            const content = response.choices[0]?.message?.content || "";
            if (content.includes("NO_PATTERN")) return null;

            // Extract JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;

            const data = JSON.parse(jsonMatch[0]);

            // Only act if confidence is high enough
            if (data.confidence < 0.7) return null;

            // Check if we already have a pending recommendation for this pattern
            const pending = getPendingRecommendations(chatId);
            if (pending.some(p => p.pattern === data.pattern)) return null;

            const id = saveRecommendation(
                chatId,
                data.pattern,
                data.suggestion,
                data.confidence,
                data.suggested_action
            );

            return {
                id,
                chat_id: chatId,
                pattern: data.pattern,
                suggestion: data.suggestion,
                suggested_action: data.suggested_action,
                confidence: data.confidence,
                status: "pending",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
        } catch (error) {
            console.error("  ⚠️ Recommendation error:", error);
            return null;
        }
    }
}
