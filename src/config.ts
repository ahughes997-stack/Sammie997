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
    return {
        telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
        openrouterApiKey: requireEnv("OPENROUTER_API_KEY"),
        groqApiKey: process.env.GROQ_API_KEY || undefined,
        allowedUserIds: parseUserIds(requireEnv("ALLOWED_USER_IDS")),
        dataDir: process.env.DATA_DIR || "./",
        serperApiKey: process.env.SERPER_API_KEY,
        gmailClientId: process.env.GMAIL_CLIENT_ID,
        gmailClientSecret: process.env.GMAIL_CLIENT_SECRET,
        gmailRedirectUri: process.env.GMAIL_REDIRECT_URI,
        gmailRefreshToken: process.env.GMAIL_REFRESH_TOKEN,
        pubsubTopicName: process.env.PUBSUB_TOPIC_NAME,
    };
}
