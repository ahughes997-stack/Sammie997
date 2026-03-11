import { google } from "googleapis";
import { loadConfig } from "./config.js";
import { createBot } from "./bot.js";

const config = loadConfig();

function getPubSubClient() {
    if (
        !config.gmailClientId ||
        !config.gmailClientSecret ||
        !config.gmailRedirectUri ||
        !config.gmailRefreshToken
    ) {
        throw new Error("Missing Gmail credentials for Pub/Sub");
    }

    const oauth2Client = new google.auth.OAuth2(
        config.gmailClientId,
        config.gmailClientSecret,
        config.gmailRedirectUri
    );

    oauth2Client.setCredentials({
        refresh_token: config.gmailRefreshToken,
    });

    return google.pubsub({ version: "v1", auth: oauth2Client });
}

function getGmailClient() {
    if (
        !config.gmailClientId ||
        !config.gmailClientSecret ||
        !config.gmailRedirectUri ||
        !config.gmailRefreshToken
    ) {
        throw new Error("Missing Gmail credentials for Watch");
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

async function setupGmailWatch() {
    try {
        const gmail = getGmailClient();
        await gmail.users.watch({
            userId: "me",
            requestBody: {
                topicName: config.pubsubTopicName,
                labelIds: ["INBOX"],
                labelFilterAction: "include",
            },
        });
        console.log("✅ Gmail watch established");
    } catch (error: any) {
        console.error("❌ Failed to setup Gmail watch:", error.message);
    }
}

export async function startGmailPubSubListener(bot: any) {
    if (!config.pubsubTopicName) {
        console.log("⚠️  Gmail Pub/Sub topic not configured. Real-time notifications disabled.");
        return;
    }

    const pubsub = getPubSubClient();
    const subscriptionName = `${config.pubsubTopicName}-sub`;

    console.log(`✅ Gmail Pub/Sub listener starting...`);

    // Setup Gmail Watch
    await setupGmailWatch();

    // Ensure subscription exists (simplified approach: try to create, ignore if exists)
    try {
        await pubsub.projects.subscriptions.create({
            name: subscriptionName,
            requestBody: {
                topic: config.pubsubTopicName,
            },
        });
    } catch (e: any) {
        if (!e.message.includes("AlreadyExists")) {
            console.error("❌ Failed to create/verify Pub/Sub subscription:", e.message);
        }
    }

    // Polling loop for Pull subscription
    const poll = async () => {
        try {
            const res = await pubsub.projects.subscriptions.pull({
                subscription: subscriptionName,
                requestBody: {
                    maxMessages: 10,
                },
            });

            const messages = res.data.receivedMessages || [];
            for (const receivedMessage of messages) {
                if (receivedMessage.message?.data) {
                    const data = JSON.parse(
                        Buffer.from(receivedMessage.message.data as string, "base64").toString()
                    );

                    // data should contain emailAddress and historyId
                    // We can notify the user about a new message
                    // Note: We'd typically use historyId to fetch changes, but for simplicity
                    // we'll just announce that there's a new email activity.

                    for (const userId of config.allowedUserIds) {
                        try {
                            await bot.api.sendMessage(
                                userId,
                                `📧 *New Gmail Activity*\nUser: ${data.emailAddress}\nCheck your inbox for updates!`
                            );
                        } catch (err: any) {
                            console.error(`❌ Failed to send Gmail notification to ${userId}:`, err.message);
                        }
                    }
                }

                // Acknowledge the message
                if (receivedMessage.ackId) {
                    await pubsub.projects.subscriptions.acknowledge({
                        subscription: subscriptionName,
                        requestBody: {
                            ackIds: [receivedMessage.ackId],
                        },
                    });
                }
            }
        } catch (error: any) {
            console.error("❌ Gmail Pub/Sub poll error:", error.message);
        }

        // Poll again after 10 seconds
        setTimeout(poll, 10000);
    };

    poll();
}
