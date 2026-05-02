/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { clearDoneTickets, createSupportTrackerOptions, formatDue, getActionableTickets, ignoreTicket, loadSupportState, markDone, markNeedsReply, saveSupportState, snoozeTicket, ticketScope } from "@api/SupportDesk";
import definePlugin, { OptionType } from "@utils/types";
import { SelectedChannelStore, showToast, Toasts, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    enabledForDms: {
        type: OptionType.BOOLEAN,
        description: "Track DMs as support conversations.",
        default: true
    },
    enabledForMatchingChannels: {
        type: OptionType.BOOLEAN,
        description: "Track guild channels whose name matches the ticket keyword pattern.",
        default: true
    },
    ticketNamePattern: {
        type: OptionType.STRING,
        description: "Case-insensitive channel-name pattern for ticket channels.",
        default: "ticket|support|order|customer|kunde|case"
    },
    markOpenedAsNeedsReply: {
        type: OptionType.BOOLEAN,
        description: "When you open a ticket-like channel, mark it as needing a reply until you send one.",
        default: true
    },
    autoMarkReplySent: {
        type: OptionType.BOOLEAN,
        description: "Automatically mark a tracked ticket done when you send a reply.",
        default: true
    },
    replySlaHours: {
        type: OptionType.NUMBER,
        description: "Default reply deadline in hours after opening or receiving a ticket message.",
        default: 12
    },
    reminderMinutes: {
        type: OptionType.NUMBER,
        description: "Minimum minutes between local overdue reminders for the same ticket.",
        default: 30
    },
    toastNewTickets: {
        type: OptionType.BOOLEAN,
        description: "Show a local toast when a new support conversation starts needing a reply.",
        default: true
    },
    postLocalReminderInChannel: {
        type: OptionType.BOOLEAN,
        description: "Also post a local-only bot reminder in the overdue ticket channel when it is selected.",
        default: true
    }
});

let reminderTimer: ReturnType<typeof setInterval> | undefined;

function options() {
    return createSupportTrackerOptions(settings.store);
}

function compactSnippet(content: string) {
    return content
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
        .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[phone]")
        .replace(/\b\d{12,19}\b/g, "[number]")
        .replace(/\b\d{1,5}\s+[A-Za-z0-9.' -]{2,40}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|platz|strasse|straße|weg)\b/gi, "[address]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
}

function authorName(message: any) {
    return message?.author?.globalName || message?.author?.username || message?.author?.id;
}

async function checkOverdue() {
    const state = await loadSupportState();
    const open = getActionableTickets(state);
    const currentTime = Date.now();
    const reminderMs = Math.max(1, settings.store.reminderMinutes) * 60 * 1000;
    const selectedChannelId = SelectedChannelStore.getChannelId?.();
    let changed = false;

    for (const ticket of open) {
        if (!ticket.dueAt || ticket.dueAt > currentTime) continue;
        if (ticket.lastReminderAt && currentTime - ticket.lastReminderAt < reminderMs) continue;

        state.tickets[ticket.channelId] = {
            ...ticket,
            lastReminderAt: currentTime
        };
        changed = true;

        showToast(`Support overdue: ${ticketScope(ticket)}`, Toasts.Type.MESSAGE, {
            position: Toasts.Position.BOTTOM
        });

        if (settings.store.postLocalReminderInChannel && selectedChannelId === ticket.channelId) {
            sendBotMessage(ticket.channelId, {
                content: "Support Desk: this conversation is overdue. Open User Settings > HeinoDiscord Settings > Support Desk to act on it."
            });
        }
    }

    if (changed) await saveSupportState(state);
}

async function showFallbackDashboard(channelId: string) {
    const state = await loadSupportState();
    const open = getActionableTickets(state);

    sendBotMessage(channelId, {
        content: [
            "**Support Desk**",
            "The main workflow is now the visible UI at User Settings > HeinoDiscord Settings > Support Desk.",
            "",
            open.length
                ? open.slice(0, 10).map(ticket => `- **${ticketScope(ticket)}**: ${formatDue(ticket)}, ${ticket.reason}`).join("\n")
                : "No open support tickets tracked locally."
        ].join("\n").slice(0, 1900)
    });
}

export default definePlugin({
    name: "SupportQueueGuard",
    description: "Automatic local support inbox: tracks ticket-like DMs/channels, reminds you when replies are due, and feeds the Support Desk UI.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Utility", "Notifications", "Organisation"],
    enabledByDefault: true,
    dependencies: ["CommandsAPI"],
    settings,

    start() {
        reminderTimer = setInterval(() => void checkOverdue(), 60_000);
        void checkOverdue();
    },

    stop() {
        if (reminderTimer) clearInterval(reminderTimer);
        reminderTimer = undefined;
    },

    flux: {
        CHANNEL_SELECT({ channelId }: { channelId?: string; }) {
            if (!channelId || !settings.store.markOpenedAsNeedsReply) return;
            void markNeedsReply(channelId, "opened", options());
        },
        MESSAGE_CREATE({ message }: any) {
            const channelId = message?.channel_id;
            if (!channelId) return;

            const currentUserId = UserStore.getCurrentUser?.()?.id;
            if (message?.author?.id && message.author.id === currentUserId) {
                if (settings.store.autoMarkReplySent) void markDone(channelId, options());
                return;
            }

            const content = compactSnippet(message?.content ?? "");
            void markNeedsReply(channelId, "incoming message", options(), {
                authorName: authorName(message),
                snippet: content,
                messageId: message?.id
            }).then(marked => {
                if (!marked || !settings.store.toastNewTickets) return;
                showToast("Support Desk added a conversation that needs a reply.", Toasts.Type.MESSAGE, {
                    position: Toasts.Position.BOTTOM
                });
            });
        }
    },

    onBeforeMessageSend(channelId) {
        if (settings.store.autoMarkReplySent) void markDone(channelId, options());
    },

    commands: [{
        name: "ticket-guard",
        description: "Fallback controls for Support Desk",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "action",
                description: "status, watch, done, snooze, ignore, clear-done",
                type: ApplicationCommandOptionType.STRING,
                required: false
            },
            {
                name: "hours",
                description: "Hours for watch/snooze deadline",
                type: ApplicationCommandOptionType.INTEGER,
                required: false
            }
        ],
        execute: async (opts, ctx) => {
            const action = String(findOption(opts, "action", "status")).toLowerCase();
            const hours = Number(findOption(opts, "hours", settings.store.replySlaHours)) || settings.store.replySlaHours;

            if (action === "status" || action === "list") {
                await showFallbackDashboard(ctx.channel.id);
                return;
            }

            if (action === "watch") {
                await markNeedsReply(ctx.channel.id, "manual watch", options(), {}, hours, true);
                sendBotMessage(ctx.channel.id, { content: `Support Desk: watching this conversation. Deadline in ${hours} hour(s).` });
                return;
            }

            if (action === "done") {
                await markDone(ctx.channel.id, options(), "done manually");
                sendBotMessage(ctx.channel.id, { content: "Support Desk: marked this conversation done." });
                return;
            }

            if (action === "snooze") {
                await snoozeTicket(ctx.channel.id, hours, options());
                sendBotMessage(ctx.channel.id, { content: `Support Desk: snoozed this conversation for ${hours} hour(s).` });
                return;
            }

            if (action === "ignore") {
                await ignoreTicket(ctx.channel.id, options());
                sendBotMessage(ctx.channel.id, { content: "Support Desk: ignoring this conversation locally." });
                return;
            }

            if (action === "clear-done") {
                await clearDoneTickets();
                sendBotMessage(ctx.channel.id, { content: "Support Desk: cleared done conversation records." });
                return;
            }

            sendBotMessage(ctx.channel.id, { content: "Unknown action. Use the Support Desk UI, or status, watch, done, snooze, ignore, clear-done." });
        }
    }]
});
