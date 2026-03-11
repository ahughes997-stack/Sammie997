import type { LLMClient } from "./llm.js";
import {
    getRecentMessages,
    getAllMemories,
    saveRecommendation,
    getPendingRecommendations,
    getRecentRecommendationsForPattern,
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
You are Gravity Claw's pattern analyzer. Identify ONE recurring pattern or future need from the history/memories below.

HISTORY:
${historyText}

MEMORIES:
${memoriesText}

INSTRUCTIONS:
1. Identify a clear pattern (e.g., "User check weather daily", "User planning a trip").
2. Only suggest if confidence > 0.7.
3. If no pattern, respond "NO_PATTERN".

RESPONSE (JSON):
{
  "category": "ID_FOR_PATTERN",
  "pattern": "Desc",
  "suggestion": "Message for user",
  "suggested_action": "Command/Tool",
  "confidence": 0.0-1.0
}
`;

        try {
            const response = await this.llm.chat([
                { role: "system", content: "You analyze patterns for proactive AI behavior. Be concise." },
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

            // Check if we already have a RECENT recommendation for this category (last 24h)
            // We use the category for more stable duplicate detection than the pattern text.
            const recentRecs = getRecentRecommendationsForPattern(chatId, data.category, 24);
            if (recentRecs.length > 0) {
                console.log(`  💡 Proactive: Skipping duplicate category "${data.category}"`);
                return null;
            }

            const id = saveRecommendation(
                chatId,
                data.category, // Save the stable category as the pattern identifier
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
                notified_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
        } catch (error) {
            console.error("  ⚠️ Recommendation error:", error);
            return null;
        }
    }
}
