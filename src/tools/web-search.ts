import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const webSearchTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "web_search",
        description:
            "Search the web using DuckDuckGo. Returns top results with titles, snippets, and URLs. Use this when the user asks about current events, facts you're unsure about, or anything that would benefit from up-to-date web information.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query (e.g., 'latest AI news', 'weather in London')",
                },
                num_results: {
                    type: "number",
                    description: "Number of results to return (default 5, max 10)",
                },
            },
            required: ["query"],
        },
    },
};

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

/**
 * Search Google via Serper.dev.
 */
export async function executeWebSearch(args: {
    query: string;
    num_results?: number;
}): Promise<string> {
    const apiKey = process.env.SERPER_API_KEY;

    if (!apiKey) {
        return JSON.stringify({
            success: false,
            message: "SERPER_API_KEY is not configured. Web search is disabled.",
        });
    }

    const maxResults = Math.min(args.num_results || 5, 10);

    try {
        console.log(`  🔍 Searching Google (Serper): "${args.query}"`);

        const response = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                q: args.query,
                num: maxResults,
            }),
        });

        if (!response.ok) {
            throw new Error(`Serper API returned ${response.status}: ${response.statusText}`);
        }

        const data: any = await response.json();
        const results: SearchResult[] = [];

        // Parse organic results
        if (data.organic && Array.isArray(data.organic)) {
            for (const item of data.organic.slice(0, maxResults)) {
                results.push({
                    title: item.title || "No title",
                    url: item.link || item.url || "",
                    snippet: item.snippet || "",
                });
            }
        }

        // Add knowledge graph if available for more context
        if (data.knowledgeGraph) {
            const kg = data.knowledgeGraph;
            results.unshift({
                title: `Knowledge Graph: ${kg.title || args.query}`,
                url: kg.website || "",
                snippet: kg.description || "",
            });
        }

        if (results.length === 0) {
            return JSON.stringify({
                success: false,
                message: "No search results found.",
                query: args.query,
            });
        }

        console.log(`  ✅ Found ${results.length} results`);

        return JSON.stringify({
            success: true,
            query: args.query,
            results: results.slice(0, maxResults),
        });
    } catch (error) {
        console.error("  ⚠️ Web search error (Serper):", error);
        return JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : "Search failed",
            query: args.query,
        });
    }
}


