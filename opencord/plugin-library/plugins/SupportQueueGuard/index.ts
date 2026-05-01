/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildStore, SelectedChannelStore, showToast, Toasts, UserStore } from "@webpack/common";

type TicketStatus = "needsReply" | "done" | "snoozed" | "ignored";

interface TicketRecord {
    channelId: string;
    channelName: string;
    guildName?: string;
    status: TicketStatus;
    reason: string;
    openedAt?: number;
    lastIncomingAt?: number;
    lastViewedAt?: number;
    lastReplyAt?: number;
    dueAt?: number;
    snoozedUntil?: number;
    lastReminderAt?: number;
}

interface QueueState {
    version: 1;
    tickets: Record<string, TicketRecord>;
}

const STORE_KEY = "HeinoSupportQueueGuard:v1";
const stateFallback: QueueState = { version: 1, tickets: {} };
let reminderTimer: ReturnType<typeof setInterval> | undefined;

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
    postLocalReminderInChannel: {
        type: OptionType.BOOLEAN,
        description: "Also post a local-only bot reminder in the overdue ticket channel when it is selected.",
        default: true
    }
});

function now() {
    return Date.now();
}

function dueInMs(hours = settings.store.replySlaHours) {
    return Math.max(1, Number(hours) || settings.store.replySlaHours) * 60 * 60 * 1000;
}

async function getState(): Promise<QueueState> {
    return await DataStore.get<QueueState>(STORE_KEY) ?? stateFallback;
}

async function saveState(state: QueueState) {
    await DataStore.set(STORE_KEY, state);
}

function getChannelLabel(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;

    return {
        channelName: channel?.name ? `#${channel.name}` : channelId,
        guildName: guild?.name
    };
}

function channelMatches(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;

    if (!channel.guild_id) return settings.store.enabledForDms;
    if (!settings.store.enabledForMatchingChannels) return false;

    try {
        return new RegExp(settings.store.ticketNamePattern, "i").test(channel.name ?? "");
    } catch {
        return false;
    }
}

function formatTicket(ticket: TicketRecord) {
    const due = ticket.dueAt ? new Date(ticket.dueAt).toLocaleString() : "no deadline";
    const scope = ticket.guildName ? `${ticket.guildName} / ${ticket.channelName}` : ticket.channelName;
    return `- **${scope}**: ${ticket.status}, due ${due}, reason: ${ticket.reason}`;
}

async function markNeedsReply(channelId: string, reason: string, hours?: number) {
    if (!channelMatches(channelId)) return;

    const state = await getState();
    const label = getChannelLabel(channelId);
    const existing = state.tickets[channelId];
    const dueAt = now() + dueInMs(hours);

    state.tickets[channelId] = {
        ...existing,
        channelId,
        ...label,
        status: "needsReply",
        reason,
        openedAt: existing?.openedAt ?? now(),
        lastViewedAt: reason === "opened" ? now() : existing?.lastViewedAt,
        lastIncomingAt: reason === "incoming message" ? now() : existing?.lastIncomingAt,
        dueAt,
        snoozedUntil: undefined
    };

    await saveState(state);
}

async function markDone(channelId: string, reason = "reply sent") {
    const state = await getState();
    const label = getChannelLabel(channelId);

    state.tickets[channelId] = {
        ...state.tickets[channelId],
        channelId,
        ...label,
        status: "done",
        reason,
        lastReplyAt: now(),
        dueAt: undefined,
        snoozedUntil: undefined
    };

    await saveState(state);
}

async function snooze(channelId: string, hours: number) {
    const state = await getState();
    const label = getChannelLabel(channelId);

    state.tickets[channelId] = {
        ...state.tickets[channelId],
        channelId,
        ...label,
        status: "snoozed",
        reason: `snoozed for ${hours} hour(s)`,
        snoozedUntil: now() + dueInMs(hours),
        dueAt: now() + dueInMs(hours)
    };

    await saveState(state);
}

async function ignore(channelId: string) {
    const state = await getState();
    const label = getChannelLabel(channelId);

    state.tickets[channelId] = {
        ...state.tickets[channelId],
        channelId,
        ...label,
        status: "ignored",
        reason: "ignored manually",
        dueAt: undefined,
        snoozedUntil: undefined
    };

    await saveState(state);
}

async function getOpenTickets() {
    const state = await getState();
    const currentTime = now();

    return Object.values(state.tickets)
        .filter(ticket => ticket.status === "needsReply" || (ticket.status === "snoozed" && (ticket.snoozedUntil ?? 0) <= currentTime))
        .sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER));
}

async function showDashboard(channelId: string) {
    const open = await getOpenTickets();

    sendBotMessage(channelId, {
        content: [
            "**SupportQueueGuard**",
            "Tracks ticket-like channels you opened or received messages in, then reminds you until you answer, snooze, or mark done.",
            "",
            open.length ? open.slice(0, 10).map(formatTicket).join("\n") : "No open support tickets tracked locally."
        ].join("\n").slice(0, 1900)
    });
}

async function checkOverdue() {
    const open = await getOpenTickets();
    const currentTime = now();
    const reminderMs = Math.max(1, settings.store.reminderMinutes) * 60 * 1000;
    const selectedChannelId = SelectedChannelStore.getChannelId?.();
    let changed = false;

    const state = await getState();
    for (const ticket of open) {
        if (!ticket.dueAt || ticket.dueAt > currentTime) continue;
        if (ticket.lastReminderAt && currentTime - ticket.lastReminderAt < reminderMs) continue;

        ticket.lastReminderAt = currentTime;
        state.tickets[ticket.channelId] = ticket;
        changed = true;

        const label = ticket.guildName ? `${ticket.guildName} / ${ticket.channelName}` : ticket.channelName;
        showToast(`Support ticket overdue: ${label}`, Toasts.Type.MESSAGE, {
            position: Toasts.Position.BOTTOM
        });

        if (settings.store.postLocalReminderInChannel && selectedChannelId === ticket.channelId) {
            sendBotMessage(ticket.channelId, {
                content: "SupportQueueGuard: this ticket is overdue. Use `/ticket-guard action:done`, `/ticket-guard action:snooze hours:2`, or reply to mark it done."
            });
        }
    }

    if (changed) await saveState(state);
}

export default definePlugin({
    name: "SupportQueueGuard",
    description: "Local ticket SLA reminder for support channels and DMs you open but have not replied to.",
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
            void markNeedsReply(channelId, "opened");
        },
        MESSAGE_CREATE({ message }: any) {
            const channelId = message?.channel_id;
            if (!channelId) return;

            const currentUserId = UserStore.getCurrentUser?.()?.id;
            if (message?.author?.id && message.author.id === currentUserId) {
                void markDone(channelId);
                return;
            }

            void markNeedsReply(channelId, "incoming message");
        }
    },

    onBeforeMessageSend(channelId) {
        void markDone(channelId);
    },

    commands: [{
        name: "ticket-guard",
        description: "Manage local support ticket reminders",
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
                await showDashboard(ctx.channel.id);
                return;
            }

            if (action === "watch") {
                await markNeedsReply(ctx.channel.id, "manual watch", hours);
                sendBotMessage(ctx.channel.id, { content: `SupportQueueGuard: watching this ticket. Deadline in ${hours} hour(s).` });
                return;
            }

            if (action === "done") {
                await markDone(ctx.channel.id, "done manually");
                sendBotMessage(ctx.channel.id, { content: "SupportQueueGuard: marked this ticket done." });
                return;
            }

            if (action === "snooze") {
                await snooze(ctx.channel.id, hours);
                sendBotMessage(ctx.channel.id, { content: `SupportQueueGuard: snoozed this ticket for ${hours} hour(s).` });
                return;
            }

            if (action === "ignore") {
                await ignore(ctx.channel.id);
                sendBotMessage(ctx.channel.id, { content: "SupportQueueGuard: ignoring this ticket locally." });
                return;
            }

            if (action === "clear-done") {
                const state = await getState();
                for (const [channelId, ticket] of Object.entries(state.tickets)) {
                    if (ticket.status === "done") delete state.tickets[channelId];
                }
                await saveState(state);
                sendBotMessage(ctx.channel.id, { content: "SupportQueueGuard: cleared done ticket records." });
                return;
            }

            sendBotMessage(ctx.channel.id, { content: "Unknown action. Use status, watch, done, snooze, ignore, or clear-done." });
        }
    }]
});
