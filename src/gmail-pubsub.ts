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
    if (!config.gmailNotificationsEnabled) {
        console.log("📴 Gmail notifications are disabled via configuration.");
        return;
    }

    if (!config.pubsubTopicName) {
        console.log("⚠️  Gmail Pub/Sub topic not configured. Real-time notifications disabled.");
        return;
    }

    const topicName = config.pubsubTopicName;
    const pubsub = getPubSubClient();

    // Correctly derive subscription name from topic name
    // Topics: projects/ID/topics/NAME -> Subscriptions: projects/ID/subscriptions/NAME-sub
    const subscriptionName = topicName.replace("/topics/", "/subscriptions/") + "-sub";

    console.log(`✅ Gmail Pub/Sub listener starting for: ${subscriptionName}`);

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
                const ackId = receivedMessage.ackId;
                if (!ackId) continue;

                console.log(`📩 [GMAIL_PUSH] Received activity message: ${ackId}`);

                // Acknowledge FIRST to stop delivery loops immediately
                try {
                    await pubsub.projects.subscriptions.acknowledge({
                        subscription: subscriptionName,
                        requestBody: {
                            ackIds: [ackId],
                        },
                    });
                    console.log(`✅ [GMAIL_PUSH] Acknowledged message: ${ackId}`);
                } catch (ackError: any) {
                    console.error(`❌ [GMAIL_PUSH] Failed to acknowledge message ${ackId}:`, ackError.message);
                    // If we can't acknowledge, we should NOT send the Telegram message
                    // otherwise we will spam the user on every poll.
                    continue;
                }

                if (receivedMessage.message?.data) {
                    try {
                        const data = JSON.parse(
                            Buffer.from(receivedMessage.message.data as string, "base64").toString()
                        );

                        // Fetch the latest message details to filter and provide rich info
                        const gmail = getGmailClient();
                        const history = await gmail.users.history.list({
                            userId: "me",
                            startHistoryId: data.historyId,
                            historyTypes: ["messageAdded"],
                        });

                        const messageAdded = history.data.history?.[0]?.messagesAdded?.[0]?.message;
                        if (messageAdded?.id) {
                            const detail = await gmail.users.messages.get({
                                userId: "me",
                                id: messageAdded.id,
                                format: "metadata",
                                metadataHeaders: ["From", "Subject"],
                            });

                            const labels = detail.data.labelIds || [];
                            const isPrimary = !labels.some(l =>
                                ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS"].includes(l)
                            );

                            if (isPrimary) {
                                const from = detail.data.payload?.headers?.find(h => h.name === "From")?.value || "Unknown Sender";
                                const subject = detail.data.payload?.headers?.find(h => h.name === "Subject")?.value || "(No Subject)";

                                for (const userId of config.allowedUserIds) {
                                    try {
                                        await bot.api.sendMessage(
                                            userId,
                                            `📧 *New Primary Email*\n👤 *From:* ${from}\n📝 *Subj:* ${subject}`
                                        );
                                        console.log(`📢 [GMAIL_PUSH] Notified user ${userId}`);
                                    } catch (err: any) {
                                        console.error(`❌ [GMAIL_PUSH] Failed to notify ${userId}:`, err.message);
                                    }
                                }
                            } else {
                                console.log(`⏭️ [GMAIL_PUSH] Skipping non-primary email: ${labels.join(", ")}`);
                            }
                        }
                    } catch (parseError: any) {
                        console.error("❌ [GMAIL_PUSH] Failed to process message data:", parseError.message);
                    }
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
