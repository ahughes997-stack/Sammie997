import { Bot, InlineKeyboard } from "grammy";
import type { Config } from "./config.js";
import type { LLMClient } from "./llm.js";
import type { TranscriptionClient } from "./transcribe.js";
import type { MemorySystem } from "./memory/index.js";
import { runAgentLoop } from "./agent.js";
import { updateRecommendationStatus, markRecommendationNotified } from "./memory/db.js";


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

    // ── Callback Query handler ───────────────────────────────────
    bot.callbackQuery(/^(acc|dis)_(.+)$/, async (ctx) => {
        const [_, action, idStr] = ctx.match!;
        const id = parseInt(idStr);
        const status = action === "acc" ? "accepted" : "dismissed";

        try {
            updateRecommendationStatus(id, status);
            const text = action === "acc"
                ? "✅ Accepted! I'll keep this pattern in mind."
                : "❌ Dismissed. I'll avoid suggesting this for now.";

            await ctx.answerCallbackQuery({ text });
            await ctx.editMessageReplyMarkup({ reply_markup: undefined });
            await ctx.reply(text);
        } catch (err: any) {
            console.error("  ⚠️ Callback error:", err.message);
        }
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

            // Proactive check after a delay (to let the user read the reply)
            if (memory) {
                setTimeout(() => checkForRecommendations(ctx, chatId, memory), 3000);
            }
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

            // Proactive check
            if (memory) {
                setTimeout(() => checkForRecommendations(ctx, chatId, memory), 3000);
            }
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

/** Check for pending recommendations and send them to the user */
async function checkForRecommendations(ctx: any, chatId: string, memory: MemorySystem) {
    try {
        const pending = memory.getPendingRecommendations(chatId);
        if (pending.length > 0) {
            // Send the most confident one
            const rec = pending[0];
            const keyboard = new InlineKeyboard()
                .text("✅ Accept", `acc_${rec.id}`)
                .text("❌ Dismiss", `dis_${rec.id}`);

            await ctx.reply(`💡 *Proactive Suggestion*\n\n${rec.suggestion}`, {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });

            // Mark as notified so we don't spam it
            markRecommendationNotified(rec.id);
        }
    } catch (err: any) {
        console.error("  ⚠️ Proactive check error:", err.message);
    }
}
