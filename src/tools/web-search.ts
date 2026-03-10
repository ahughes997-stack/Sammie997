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
    // Use DuckDuckGo's standard HTML endpoint
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `q=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
        throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const html = await response.text();
    return parseResults(html, maxResults);
}

/**
 * Parse DuckDuckGo HTML results.
 * Structure uses:
 *   - <a class="result__a" href="...">Title</a>
 *   - <a class="result__snippet" ...>Snippet</a>
 */
function parseResults(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    // Match each result block: contains result__a (title+link) and result__snippet
    const resultBlockRegex =
        /<div[^>]*class="[^"]*result [^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="[^"]*result |$)/gi;

    // Individual field patterns
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i;

    // Simpler fallback: just find all result__a links and result__snippet elements
    const allLinks: { url: string; title: string }[] = [];
    const allSnippets: string[] = [];

    const globalLinkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const globalSnippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;

    while ((match = globalLinkRegex.exec(html)) !== null) {
        let href = match[1].trim();
        // DuckDuckGo wraps URLs in redirects — extract the actual URL
        const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) {
            href = decodeURIComponent(uddgMatch[1]);
        }
        allLinks.push({
            url: href,
            title: stripHtml(match[2]).trim(),
        });
    }

    while ((match = globalSnippetRegex.exec(html)) !== null) {
        allSnippets.push(stripHtml(match[1]).trim());
    }

    const count = Math.min(allLinks.length, maxResults);
    for (let i = 0; i < count; i++) {
        if (!allLinks[i].url || allLinks[i].url.startsWith("//duckduckgo")) continue;

        results.push({
            title: allLinks[i].title || "No title",
            url: allLinks[i].url,
            snippet: allSnippets[i] || "",
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

