import { google } from "googleapis";
import { loadConfig } from "../config.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";

function getGmailClient() {
    const config = loadConfig(); // Refresh config from process.env
    if (
        !config.gmailClientId ||
        !config.gmailClientSecret ||
        !config.gmailRedirectUri ||
        !config.gmailRefreshToken
    ) {
        throw new Error("Missing Gmail credentials in configuration");
    }

    const oauth2Client = new google.auth.OAuth2(
        config.gmailClientId,
        config.gmailClientSecret,
        config.gmailRedirectUri
    );

    oauth2Client.setCredentials({
        refresh_token: config.gmailRefreshToken,
    });

    return google.gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Diagnostic tool to check Gmail authentication status and environment.
 */
export const diagnoseGmailTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "diagnose_gmail",
        description: "Check Gmail authentication status and verify environment variables.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
};

export async function executeDiagnoseGmail(): Promise<string> {
    const config = loadConfig();
    const stats = {
        hasClientId: !!config.gmailClientId,
        hasClientSecret: !!config.gmailClientSecret,
        hasRedirectUri: !!config.gmailRedirectUri,
        hasRefreshToken: !!config.gmailRefreshToken,
        clientIdLength: config.gmailClientId?.length || 0,
        refreshTokenLength: config.gmailRefreshToken?.length || 0,
        env: process.env.NODE_ENV || "development",
    };

    try {
        const gmail = getGmailClient();
        console.log("🔍 [DIAGNOSE] Attempting Gmail API call...");
        const res = await gmail.users.messages.list({ userId: "me", maxResults: 1 });
        return JSON.stringify({
            status: "success",
            message: "Successfully connected to Gmail API",
            stats,
            messageCount: res.data.resultSizeEstimate,
        });
    } catch (error: any) {
        const errorData = error.response?.data || {};
        const isInvalidGrant = JSON.stringify(errorData).includes("invalid_grant");
        const isUnauthorized = error.code === 401;

        let suggestion = "Check your Railway environment variables.";
        if (isInvalidGrant) {
            suggestion = "Refresh token is invalid or expired. You may need to regenerate it using npx tsx scripts/get-refresh-token.ts";
        } else if (isUnauthorized) {
            suggestion = "Unauthorized. Check if your Client ID/Secret match the Google Cloud Console.";
        }

        return JSON.stringify({
            status: "error",
            message: error.message,
            stats,
            suggestion,
            rawError: errorData,
            errorCode: error.code,
        });
    }
}

// ── List Messages ────────────────────────────────────────────────
export const listGmailMessagesTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "list_gmail_messages",
        description: "List Gmail messages matching a query (e.g., 'from:someone', 'is:unread').",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Gmail search query (optional).",
                },
                maxResults: {
                    type: "number",
                    description: "Maximum number of messages to return (default 10).",
                },
            },
        },
    },
};

export async function executeListGmailMessages(args: {
    query?: string;
    maxResults?: number;
}): Promise<string> {
    try {
        const gmail = getGmailClient();
        const res = await gmail.users.messages.list({
            userId: "me",
            q: args.query,
            maxResults: args.maxResults || 10,
        });

        const messages = res.data.messages || [];
        if (messages.length === 0) {
            return "No messages found.";
        }

        return JSON.stringify(messages, null, 2);
    } catch (error: any) {
        return JSON.stringify({ error: error.message });
    }
}

// ── Get Message ──────────────────────────────────────────────────
export const getGmailMessageTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "get_gmail_message",
        description: "Retrieve details of a specific Gmail message by ID.",
        parameters: {
            type: "object",
            properties: {
                messageId: {
                    type: "string",
                    description: "The ID of the message to retrieve.",
                },
            },
            required: ["messageId"],
        },
    },
};

export async function executeGetGmailMessage(args: {
    messageId: string;
}): Promise<string> {
    try {
        const gmail = getGmailClient();
        const res = await gmail.users.messages.get({
            userId: "me",
            id: args.messageId,
        });

        return JSON.stringify(res.data, null, 2);
    } catch (error: any) {
        return JSON.stringify({ error: error.message });
    }
}

// ── Send Message ─────────────────────────────────────────────────
export const sendGmailMessageTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "send_gmail_message",
        description: "Send an email message via Gmail.",
        parameters: {
            type: "object",
            properties: {
                to: {
                    type: "string",
                    description: "Recipient email address.",
                },
                subject: {
                    type: "string",
                    description: "Email subject.",
                },
                body: {
                    type: "string",
                    description: "Email body text.",
                },
            },
            required: ["to", "subject", "body"],
        },
    },
};

export async function executeSendGmailMessage(args: {
    to: string;
    subject: string;
    body: string;
}): Promise<string> {
    try {
        const gmail = getGmailClient();
        const utf8Subject = `=?utf-8?B?${Buffer.from(args.subject).toString("base64")}?=`;
        const messageParts = [
            `To: ${args.to}`,
            "Content-Type: text/plain; charset=utf-8",
            "MIME-Version: 1.0",
            `Subject: ${utf8Subject}`,
            "",
            args.body,
        ];
        const message = messageParts.join("\n");
        const encodedMessage = Buffer.from(message)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        const res = await gmail.users.messages.send({
            userId: "me",
            requestBody: {
                raw: encodedMessage,
            },
        });

        return `Email sent successfully. Message ID: ${res.data.id}`;
    } catch (error: any) {
        return JSON.stringify({ error: error.message });
    }
}

// ── Create Draft ─────────────────────────────────────────────────
export const createGmailDraftTool: ChatCompletionTool = {
    type: "function",
    function: {
        name: "create_gmail_draft",
        description: "Create a draft email message in Gmail.",
        parameters: {
            type: "object",
            properties: {
                to: {
                    type: "string",
                    description: "Recipient email address.",
                },
                subject: {
                    type: "string",
                    description: "Email subject.",
                },
                body: {
                    type: "string",
                    description: "Email body text.",
                },
            },
            required: ["to", "subject", "body"],
        },
    },
};

export async function executeCreateGmailDraft(args: {
    to: string;
    subject: string;
    body: string;
}): Promise<string> {
    try {
        const gmail = getGmailClient();
        const utf8Subject = `=?utf-8?B?${Buffer.from(args.subject).toString("base64")}?=`;
        const messageParts = [
            `To: ${args.to}`,
            "Content-Type: text/plain; charset=utf-8",
            "MIME-Version: 1.0",
            `Subject: ${utf8Subject}`,
            "",
            args.body,
        ];
        const message = messageParts.join("\n");
        const encodedMessage = Buffer.from(message)
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");

        const res = await gmail.users.drafts.create({
            userId: "me",
            requestBody: {
                message: {
                    raw: encodedMessage,
                },
            },
        });

        return `Draft created successfully. Draft ID: ${res.data.id}`;
    } catch (error: any) {
        return JSON.stringify({ error: error.message });
    }
}
