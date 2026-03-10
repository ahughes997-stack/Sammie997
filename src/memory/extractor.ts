import type { LLMClient } from "../llm.js";
import { saveMemory, searchMemories } from "./db.js";

const EXTRACTION_PROMPT = `Analyze this conversation exchange and extract any facts worth remembering about the user. Focus on:
- Personal details (name, location, job, family, pets)
- Preferences and opinions
- Plans, goals, projects
- Important dates or events
- Technical preferences or skills
- Anything the user explicitly asks to remember

Return a JSON array of objects with "content" and "category" fields.
Categories: "personal", "preference", "plan", "fact", "instruction"

If nothing new or noteworthy, return an empty array: []

IMPORTANT: Only extract NEW information. Do not repeat things that are obvious or generic.
Respond ONLY with the JSON array, no other text.`;

interface ExtractedMemory {
    content: string;
    category: string;
}

export async function extractMemories(
    llm: LLMClient,
    userMessage: string,
    assistantResponse: string
): Promise<ExtractedMemory[]> {
    try {
        const response = await llm.chat([
            {
                role: "user",
                content: `${EXTRACTION_PROMPT}\n\n---\nUser: ${userMessage}\nAssistant: ${assistantResponse}`,
            },
        ]);

        const text = response.choices[0]?.message?.content || "[]";

        // Parse JSON from response (handle markdown code blocks)
        const jsonStr = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        const memories: ExtractedMemory[] = JSON.parse(jsonStr);

        if (!Array.isArray(memories)) return [];

        return memories.filter(
            (m) =>
                m &&
                typeof m.content === "string" &&
                m.content.length > 0 &&
                typeof m.category === "string"
        );
    } catch (error) {
        console.error("  ⚠️ Memory extraction failed:", error);
        return [];
    }
}

/**
 * Save extracted memories, skipping duplicates.
 * Uses FTS5 search to check if a very similar memory already exists.
 */
export async function saveNewMemories(
    memories: ExtractedMemory[],
    source?: string
): Promise<number> {
    let saved = 0;

    for (const mem of memories) {
        // Check for duplicates via FTS5
        try {
            const existing = searchMemories(mem.content, 3);
            const isDuplicate = existing.some((e) => {
                // Simple similarity: check if content is substantially the same
                const a = e.content.toLowerCase();
                const b = mem.content.toLowerCase();
                return a === b || a.includes(b) || b.includes(a);
            });

            if (!isDuplicate) {
                saveMemory(mem.content, mem.category, source);
                saved++;
                console.log(`  💾 Saved memory [${mem.category}]: ${mem.content}`);
            } else {
                console.log(`  ♻️  Skipped duplicate: ${mem.content.substring(0, 50)}`);
            }
        } catch {
            // FTS5 match can fail on certain query strings; save anyway
            saveMemory(mem.content, mem.category, source);
            saved++;
        }
    }

    return saved;
}
