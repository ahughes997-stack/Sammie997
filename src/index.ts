import { loadConfig } from "./config.js";
import { createLLMClient } from "./llm.js";
import { createTranscriptionClient } from "./transcribe.js";
import { createBot } from "./bot.js";
import { MemorySystem } from "./memory/index.js";
import { initializeDb, closeDb, getMemoryCount } from "./memory/db.js";
import { startGmailPubSubListener } from "./gmail-pubsub.js";
import { startTodoistPoker } from "./todoist-poker.js";

async function main() {
    console.log(`
   ╔══════════════════════════════════════╗
   ║          🦀 GRAVITY CLAW            ║
   ║     Personal AI Agent — Level 2     ║
   ╚══════════════════════════════════════╝
  `);

    // ── Load config ──────────────────────────────────────────────
    const config = loadConfig();
    console.log(`✅ Config loaded`);
    console.log(`   Allowed users: ${config.allowedUserIds.join(", ")}`);

    // ── Initialize LLM client ──────────────────────────────────
    const llm = createLLMClient(config);
    console.log(`✅ LLM client ready (Claude via OpenRouter)`);

    // ── Initialize transcription client ─────────────────────────
    const transcriber = createTranscriptionClient(config);
    console.log(
        config.groqApiKey
            ? `✅ Voice transcription ready (Groq Whisper)`
            : `⚠️  Voice transcription disabled (no GROQ_API_KEY)`
    );

    // ── Initialize memory system ────────────────────────────────
    initializeDb(config.dataDir); // ensures DB + schema are created
    const memory = new MemorySystem(llm);
    const memCount = getMemoryCount();
    console.log(
        `✅ Memory system ready (${memCount} stored memories)`
    );

    // ── Initialize Telegram bot ─────────────────────────────────
    const bot = createBot(config, llm, transcriber, memory);

    // ── Initialize Gmail Pub/Sub listener ───────────────────────
    await startGmailPubSubListener(bot);

    // ── Initialize Todoist Poker ──────────────────────────────
    await startTodoistPoker(bot);

    // Graceful shutdown
    const shutdown = () => {
        console.log("\n👋 Shutting down...");
        bot.stop();
        closeDb();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // ── Start polling (no web server!) ──────────────────────────
    console.log(
        `\n🚀 Bot is running — listening for messages via long-polling`
    );
    console.log(`   No web server. No exposed ports. Telegram-only.\n`);
    console.log(`✅ System startup sequence complete`);
    await bot.start();
}

main().catch((error) => {
    console.error("💥 Fatal error:", error);
    process.exit(1);
});
