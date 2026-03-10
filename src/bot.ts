import { Bot } from "grammy";
import type { Config } from "./config.js";
import type { LLMClient } from "./llm.js";
import type { TranscriptionClient } from "./transcribe.js";
import type { MemorySystem } from "./memory/index.js";
import { runAgentLoop } from "./agent.js";

export function createBot(
    config: Config,
    llm: LLMClient,
    transcriber: TranscriptionClient,
    memory?: MemorySystem
): Bot {
    const bot = new Bot(config.telegramBotToken);
    const allowedIds = new Set(config.allowedUserIds);

    // ── Security middleware ──────────────────────────────────────
    // Silently ignore messages from unauthorized users.
    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;
        if (!userId || !allowedIds.has(userId)) {
            return; // silent drop
        }
        await next();
    });

    // ── Text message handler ─────────────────────────────────────
    bot.on("message:text", async (ctx) => {
        const text = ctx.message.text;
        const userId = ctx.from.id;

        console.log(`\n📩 Message from ${userId}: ${text.substring(0, 100)}`);
        await ctx.replyWithChatAction("typing");

        try {
            const chatId = String(ctx.chat.id);
            const result = await runAgentLoop(llm, text, chatId, memory);
            console.log(
                `📤 Response (${result.iterations} iters, ${result.toolCalls} tools)`
            );
            await sendResponse(ctx, result.response);
        } catch (error) {
            console.error("❌ Agent error:", error);
            await ctx.reply(
                "Something went wrong processing your message. Check the console for details."
            );
        }
    });

    // ── Voice message handler ────────────────────────────────────
    bot.on("message:voice", async (ctx) => {
        const userId = ctx.from.id;
        console.log(`\n🎤 Voice message from ${userId} (${ctx.message.voice.duration}s)`);
        await ctx.replyWithChatAction("typing");

        try {
            // Download the voice file from Telegram
            const file = await ctx.getFile();
            const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to download voice file: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            // Telegram sends .oga files — rename to .ogg for Groq Whisper compatibility
            const rawName = file.file_path?.split("/").pop() || "voice.oga";
            const filename = rawName.replace(/\.oga$/, ".ogg");

            console.log(`  📥 Downloaded ${buffer.length} bytes: ${filename}`);

            // Transcribe
            const transcript = await transcriber.transcribe(buffer, filename);
            console.log(`  📝 Transcript: "${transcript}"`);

            if (!transcript) {
                await ctx.reply("I couldn't make out what you said. Could you try again?");
                return;
            }

            // Process through agent loop
            await ctx.replyWithChatAction("typing");
            const chatId = String(ctx.chat.id);
            const result = await runAgentLoop(llm, transcript, chatId, memory);
            console.log(
                `📤 Response (${result.iterations} iters, ${result.toolCalls} tools)`
            );

            // Reply with transcription + response
            const reply = `🎤 *Heard:* "${transcript}"\n\n${result.response}`;
            await sendResponse(ctx, reply);
        } catch (error) {
            console.error("❌ Voice error:", error);
            const msg =
                error instanceof Error
                    ? error.message
                    : "Something went wrong processing your voice message.";
            await ctx.reply(msg);
        }
    });

    return bot;
}

// ── Helpers ────────────────────────────────────────────────────

/** Send a response, splitting if over Telegram's 4096 char limit */
async function sendResponse(
    ctx: { reply: (text: string, options?: Record<string, unknown>) => Promise<unknown> },
    text: string
): Promise<void> {
    if (text.length <= 4096) {
        await ctx
            .reply(text, { parse_mode: "Markdown" })
            .catch(() => ctx.reply(text));
    } else {
        const chunks = splitMessage(text, 4096);
        for (const chunk of chunks) {
            await ctx
                .reply(chunk, { parse_mode: "Markdown" })
                .catch(() => ctx.reply(chunk));
        }
    }
}

/** Split a long message into chunks at newline boundaries */
function splitMessage(text: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLen) {
        let splitAt = remaining.lastIndexOf("\n", maxLen);
        if (splitAt === -1 || splitAt < maxLen / 2) {
            splitAt = maxLen;
        }
        chunks.push(remaining.substring(0, splitAt));
        remaining = remaining.substring(splitAt).trimStart();
    }

    if (remaining.length > 0) {
        chunks.push(remaining);
    }

    return chunks;
}
