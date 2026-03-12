import { TodoistApi } from "@doist/todoist-api-typescript";
import { loadConfig } from "./config.js";

const config = loadConfig();

export async function startTodoistPoker(bot: any) {
    if (!config.todoistToken || !config.todoistPokingEnabled) {
        console.log("📴 Todoist poking is disabled or token is missing.");
        return;
    }

    const api = new TodoistApi(config.todoistToken);

    const checkTasks = async () => {
        try {
            console.log("🔍 [TODOIST_POKER] Checking for overdue or stale tasks...");
            const tasks = (await api.getTasks() as unknown) as any[];

            const now = new Date();
            const staleThreshold = config.todoistStaleThresholdDays * 24 * 60 * 60 * 1000;

            const overdue = tasks.filter((t: any) => t.due?.date && new Date(t.due.date) < now);
            const stale = tasks.filter((t: any) => {
                // If it has a due date, we treat it as an overdue check item, not a stale item.
                if (t.due) return false;

                const createdAtRaw = t.created_at || t.createdAt;
                if (!createdAtRaw) return false;

                const created = new Date(createdAtRaw);
                return (now.getTime() - created.getTime()) > staleThreshold;
            });

            if (overdue.length > 0 || stale.length > 0) {
                let message = "⚠️ *Todoist Attention Required*\n\n";

                if (overdue.length > 0) {
                    message += "🚨 *Overdue Tasks:*\n";
                    overdue.slice(0, 5).forEach(t => {
                        message += `- ${t.content} (Due: ${t.due?.string || t.due?.date})\n`;
                    });
                    if (overdue.length > 5) message += `...and ${overdue.length - 5} more.\n`;
                    message += "\n";
                }

                if (stale.length > 0) {
                    message += "⏳ *Stale Tasks (Waiting for a while):*\n";
                    stale.slice(0, 5).forEach(t => {
                        message += `- ${t.content}\n`;
                    });
                    if (stale.length > 5) message += `...and ${stale.length - 5} more.\n`;
                }

                for (const userId of config.allowedUserIds) {
                    try {
                        await bot.api.sendMessage(userId, message, { parse_mode: "Markdown" });
                        console.log(`📢 [TODOIST_POKER] Poked user ${userId}`);
                    } catch (err: any) {
                        console.error(`❌ [TODOIST_POKER] Failed to poke user ${userId}:`, err.message);
                    }
                }
            } else {
                console.log("✅ [TODOIST_POKER] No problematic tasks found.");
            }
        } catch (error: any) {
            console.error("❌ [TODOIST_POKER] Error checking tasks:", error.message);
        }

        // Run check every hour (3600000 ms)
        setTimeout(checkTasks, 3600000);
    };

    // Initial check after 30 seconds to let bot warm up
    setTimeout(checkTasks, 30000);
}
