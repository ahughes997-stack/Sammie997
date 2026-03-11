import { google } from "googleapis";
import "dotenv/config";

async function testGmailAuth() {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
    const redirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost";

    console.log("Testing with:");
    console.log("Client ID:", clientId);
    console.log("Refresh Token:", refreshToken ? "PRESENT" : "MISSING");

    if (!clientId || !clientSecret || !refreshToken) {
        console.error("❌ Missing credentials in .env");
        return;
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    try {
        const gmail = google.gmail({ version: "v1", auth: oauth2Client });
        const res = await gmail.users.getProfile({ userId: "me" });
        console.log("✅ Auth Successful! Profile email:", res.data.emailAddress);
    } catch (error: any) {
        console.error("❌ Auth Failed:", error.message);
        if (error.response && error.response.data) {
            console.error("Error Detail:", JSON.stringify(error.response.data, null, 2));
        }
    }
}

testGmailAuth();
