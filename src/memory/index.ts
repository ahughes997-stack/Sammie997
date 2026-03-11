import type { LLMClient } from "../llm.js";
import {
    saveMessage,
    getRecentMessages,
    searchMemories,
    getMemoryCount,
    getRecentSummaries,
    getPendingRecommendations,
    type StoredMemory,
    type StoredRecommendation,
} from "./db.js";
import { extractMemories, saveNewMemories } from "./extractor.js";
import { RecommendationEngine } from "../proactive.js";

export class MemorySystem {
    private recommender: RecommendationEngine;
    private turnCounter: number = 0;

    constructor(private llm: LLMClient) {
        this.recommender = new RecommendationEngine(llm);
    }

    /**
     * Retrieve context relevant to the current message.
     * Returns a formatted string to inject into the system prompt.
     */
    async getContext(chatId: string, userMessage: string): Promise<string> {
        const parts: string[] = [];

        // 1. Search core memories relevant to this message
        const memories = this.recall(userMessage);
        if (memories.length > 0) {
            parts.push("## What you remember about the user");
            for (const m of memories) {
                parts.push(`- [${m.category}] ${m.content}`);
            }
        }

        // 2. Recent conversation history
        const recent = getRecentMessages(chatId, 20).reverse(); // oldest first
        if (recent.length > 0) {
            parts.push("\n## Recent conversation");
            for (const msg of recent) {
                const prefix = msg.role === "user" ? "User" : "You";
                // Truncate very long messages in context
                const content =
                    msg.content.length > 500
                        ? msg.content.substring(0, 500) + "..."
                        : msg.content;
                parts.push(`${prefix}: ${content}`);
            }
        }

        // 3. Past conversation summaries
        const summaries = getRecentSummaries(3);
        if (summaries.length > 0) {
            parts.push("\n## Past conversation summaries");
            for (const s of summaries) {
                parts.push(`- (${s.created_at}) ${s.summary}`);
            }
        }

        return parts.join("\n");
    }

    /**
     * Search core memories by query.
     */
    recall(query: string, limit: number = 10): StoredMemory[] {
        try {
            // Build an FTS5-safe query by quoting individual words
            const words = query
                .replace(/[^\w\s]/g, "")
                .split(/\s+/)
                .filter((w) => w.length > 2);

            if (words.length === 0) return [];

            // Use OR to match any relevant word
            const ftsQuery = words.map((w) => `"${w}"`).join(" OR ");
            return searchMemories(ftsQuery, limit);
        } catch {
            return [];
        }
    }

    /**
     * Process a completed conversation turn:
     * - Save messages to buffer
     * - Extract and store new memories
     */
    async processConversationTurn(
        chatId: string,
        userMessage: string,
        assistantResponse: string
    ): Promise<void> {
        // Save raw messages
        saveMessage(chatId, "user", userMessage);
        saveMessage(chatId, "assistant", assistantResponse);

        // Extract memories in background (don't block the response)
        const extracted = await extractMemories(
            this.llm,
            userMessage,
            assistantResponse
        );

        if (extracted.length > 0) {
            const saved = await saveNewMemories(extracted, `chat:${chatId}`);
            const total = getMemoryCount();
            console.log(
                `  🧠 Memory: extracted ${extracted.length}, saved ${saved}, total ${total}`
            );
        }

        // 3. Proactive recommendation analysis (only every 5 messages to save tokens)
        this.turnCounter++;
        if (this.turnCounter >= 5) {
            console.log(`  💡 Proactive: Triggering analysis (turn ${this.turnCounter})`);
            this.turnCounter = 0;
            this.recommender.analyzeAndSuggest(chatId).then((rec) => {
                if (rec) {
                    console.log(`  💡 Proactive: Generated recommendation for ${chatId}: ${rec.suggestion}`);
                }
            }).catch((err) => console.error("  ⚠️ Proactive analysis error:", err));
        } else {
            console.log(`  💡 Proactive: Skipping until turn 5 (current: ${this.turnCounter})`);
        }
    }

    /**
     * Get pending recommendations for a user.
     */
    getPendingRecommendations(chatId: string): StoredRecommendation[] {
        return getPendingRecommendations(chatId);
    }
}
