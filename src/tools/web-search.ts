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
 * Search DuckDuckGo via their HTML lite endpoint and parse results.
 * No API key required — completely free.
 */
export async function executeWebSearch(args: {
    query: string;
    num_results?: number;
}): Promise<string> {
    const maxResults = Math.min(args.num_results || 5, 10);

    try {
        console.log(`  🔍 Searching: "${args.query}"`);

        const results = await searchDuckDuckGo(args.query, maxResults);

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
            results: results,
        });
    } catch (error) {
        console.error("  ⚠️ Web search error:", error);
        return JSON.stringify({
            success: false,
            message:
                error instanceof Error ? error.message : "Search failed",
            query: args.query,
        });
    }
}

async function searchDuckDuckGo(
    query: string,
    maxResults: number
): Promise<SearchResult[]> {
    // Use DuckDuckGo's HTML lite endpoint
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html",
        },
    });

    if (!response.ok) {
        throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const html = await response.text();
    return parseResults(html, maxResults);
}

/**
 * Parse DuckDuckGo lite HTML results.
 * The lite page has a simple table structure:
 *   - Result links are in <a> tags with class "result-link"
 *   - Snippets follow in <td> elements with class "result-snippet"
 */
function parseResults(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    // Extract result links: <a rel="nofollow" href="URL" class="result-link">TITLE</a>
    const linkRegex =
        /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

    // Extract snippets: <td class="result-snippet">(content)</td>
    const snippetRegex =
        /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

    const links: { url: string; title: string }[] = [];
    const snippets: string[] = [];

    let match;

    while ((match = linkRegex.exec(html)) !== null) {
        links.push({
            url: match[1].trim(),
            title: stripHtml(match[2]).trim(),
        });
    }

    while ((match = snippetRegex.exec(html)) !== null) {
        snippets.push(stripHtml(match[1]).trim());
    }

    // Combine links with their corresponding snippets
    const count = Math.min(links.length, maxResults);
    for (let i = 0; i < count; i++) {
        // Skip DuckDuckGo internal links
        if (links[i].url.startsWith("//duckduckgo.com")) continue;

        results.push({
            title: links[i].title,
            url: links[i].url,
            snippet: snippets[i] || "",
        });
    }

    return results;
}

/** Remove HTML tags and decode entities */
function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
