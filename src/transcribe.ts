import OpenAI, { toFile } from "openai";
import type { Config } from "./config.js";

export interface TranscriptionClient {
    transcribe(buffer: Buffer, filename: string): Promise<string>;
}

export function createTranscriptionClient(config: Config): TranscriptionClient {
    if (!config.groqApiKey) {
        return {
            async transcribe(): Promise<string> {
                throw new Error(
                    "Voice messages require a GROQ_API_KEY in .env. Get one free at https://console.groq.com"
                );
            },
        };
    }

    const client = new OpenAI({
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: config.groqApiKey,
    });

    return {
        async transcribe(buffer: Buffer, filename: string): Promise<string> {
            const file = await toFile(buffer, filename, { type: "audio/ogg" });

            const response = await client.audio.transcriptions.create({
                model: "whisper-large-v3-turbo",
                file,
                response_format: "text",
            });

            // response is a string when response_format is "text"
            return (response as unknown as string).trim();
        },
    };
}
