import { google } from "googleapis";
import "dotenv/config";

async function checkGmail() {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GMAIL_REDIRECT_URI;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
        console.error("❌ Missing environment variables");
        process.exit(1);
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
        console.log("⏳ Attempting to list Gmail messages...");
        const res = await gmail.users.messages.list({ userId: "me", maxResults: 1 });
        console.log("✅ OAuth success! Messages found:", res.data.resultSizeEstimate);
    } catch (error: any) {
        console.error("❌ OAuth failed:", error.message);
        if (error.response && error.response.data) {
            console.error("Details:", JSON.stringify(error.response.data, null, 2));
        }
    }
}

checkGmail();
