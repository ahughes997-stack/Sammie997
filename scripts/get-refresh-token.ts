import { google } from "googleapis";
import readline from "readline";
import fs from "fs";
import "dotenv/config";

/**
 * HELPER SCRIPT TO GET GMAIL REFRESH TOKEN
 * 
 * 1. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in your .env
 * 2. Run: npx tsx scripts/get-refresh-token.ts
 */

const SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/pubsub"
];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

async function main() {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost";

    if (!clientId || !clientSecret) {
        console.error("❌ Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in .env");
        process.exit(1);
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent" // Force to get refresh token
    });

    console.log("\n🚀 Authorize this app by visiting this url:");
    console.log(authUrl);

    rl.question("\n🔑 Enter the code from that page here: ", async (code) => {
        rl.close();
        try {
            const { tokens } = await oauth2Client.getToken(code);
            console.log("\n✅ Success! Your tokens:");
            console.log(JSON.stringify(tokens, null, 2));

            // Save to file to avoid terminal mangling
            fs.writeFileSync("gmail-tokens.json", JSON.stringify(tokens, null, 2));
            console.log("\n📌 Tokens also saved to 'gmail-tokens.json'.");

            console.log("\n📌 Copy the 'refresh_token' to your .env file.");
        } catch (err: any) {
            console.error("❌ Error retrieving access token", err.message);
        }
    });
}

main();
