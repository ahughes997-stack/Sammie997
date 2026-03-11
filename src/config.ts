import "dotenv/config";

export interface Config {
    telegramBotToken: string;
    openrouterApiKey: string;
    groqApiKey: string | undefined;
    allowedUserIds: number[];
    dataDir: string;
    serperApiKey: string | undefined;
    gmailClientId: string | undefined;
    gmailClientSecret: string | undefined;
    gmailRedirectUri: string | undefined;
    gmailRefreshToken: string | undefined;
    pubsubTopicName: string | undefined;
    llmModel: string;
}

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        console.error(`❌ Missing required environment variable: ${name}`);
        console.error(`   Copy .env.example to .env and fill in your values.`);
        process.exit(1);
    }
    return value;
}

function parseUserIds(raw: string): number[] {
    const ids = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);

    if (ids.some(isNaN)) {
        console.error(`❌ ALLOWED_USER_IDS must be comma-separated numbers`);
        process.exit(1);
    }

    if (ids.length === 0) {
        console.error(`❌ ALLOWED_USER_IDS must contain at least one user ID`);
        process.exit(1);
    }

    return ids;
}

export function loadConfig(): Config {
    const config = {
        telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
        openrouterApiKey: requireEnv("OPENROUTER_API_KEY"),
        groqApiKey: process.env.GROQ_API_KEY || undefined,
        allowedUserIds: parseUserIds(requireEnv("ALLOWED_USER_IDS")),
        dataDir: process.env.DATA_DIR || "./",
        serperApiKey: process.env.SERPER_API_KEY,
        gmailClientId: requireEnv("GMAIL_CLIENT_ID"),
        gmailClientSecret: requireEnv("GMAIL_CLIENT_SECRET"),
        gmailRedirectUri: requireEnv("GMAIL_REDIRECT_URI"),
        gmailRefreshToken: requireEnv("GMAIL_REFRESH_TOKEN"),
        pubsubTopicName: requireEnv("PUBSUB_TOPIC_NAME"),
        llmModel: process.env.LLM_MODEL || "google/gemini-2.0-flash-001",
    };

    // Masked logging for debugging Railway environment
    if (process.env.NODE_ENV !== "test") {
        const mask = (s: string | undefined) =>
            s ? `${s.slice(0, 5)}...${s.slice(-5)}` : "MISSING";

        console.log(`📡 [CONFIG_DIAGNOSTIC]`);
        console.log(`   Client ID: ${mask(config.gmailClientId)} (${config.gmailClientId?.length} chars)`);
        console.log(`   Secret:    ${mask(config.gmailClientSecret)} (${config.gmailClientSecret?.length} chars)`);
        console.log(`   Refresh:   ${mask(config.gmailRefreshToken)} (${config.gmailRefreshToken?.length} chars)`);
        console.log(`   Topic:     ${config.pubsubTopicName}`);
    }

    return config;
}
