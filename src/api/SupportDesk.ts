/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { ChannelRouter, ChannelStore, GuildStore } from "@webpack/common";

export type TicketStatus = "needsReply" | "done" | "snoozed" | "ignored";

export interface TicketRecord {
    channelId: string;
    channelName: string;
    guildName?: string;
    status: TicketStatus;
    reason: string;
    openedAt?: number;
    lastIncomingAt?: number;
    lastViewedAt?: number;
    lastReplyAt?: number;
    lastActivityAt?: number;
    dueAt?: number;
    snoozedUntil?: number;
    lastReminderAt?: number;
    unreadCount?: number;
    lastAuthorName?: string;
    lastSnippet?: string;
    lastMessageId?: string;
}

export interface QueueState {
    version: 1;
    tickets: Record<string, TicketRecord>;
}

export interface SupportTrackerOptions {
    enabledForDms: boolean;
    enabledForMatchingChannels: boolean;
    ticketNamePattern: string;
    replySlaHours: number;
}

export interface TicketMeta {
    authorName?: string;
    snippet?: string;
    messageId?: string;
}

export const SUPPORT_QUEUE_STORE_KEY = "HeinoSupportQueueGuard:v1";

export const DEFAULT_SUPPORT_TRACKER_OPTIONS: SupportTrackerOptions = {
    enabledForDms: true,
    enabledForMatchingChannels: true,
    ticketNamePattern: "ticket|support|order|customer|kunde|case",
    replySlaHours: 12
};

function emptyState(): QueueState {
    return { version: 1, tickets: {} };
}

export function createSupportTrackerOptions(raw: Partial<SupportTrackerOptions> | undefined): SupportTrackerOptions {
    return {
        enabledForDms: raw?.enabledForDms ?? DEFAULT_SUPPORT_TRACKER_OPTIONS.enabledForDms,
        enabledForMatchingChannels: raw?.enabledForMatchingChannels ?? DEFAULT_SUPPORT_TRACKER_OPTIONS.enabledForMatchingChannels,
        ticketNamePattern: raw?.ticketNamePattern || DEFAULT_SUPPORT_TRACKER_OPTIONS.ticketNamePattern,
        replySlaHours: Number(raw?.replySlaHours) || DEFAULT_SUPPORT_TRACKER_OPTIONS.replySlaHours
    };
}

export function now() {
    return Date.now();
}

export function dueInMs(hours = DEFAULT_SUPPORT_TRACKER_OPTIONS.replySlaHours) {
    return Math.max(1, Number(hours) || DEFAULT_SUPPORT_TRACKER_OPTIONS.replySlaHours) * 60 * 60 * 1000;
}

export async function loadSupportState(): Promise<QueueState> {
    const existing = await DataStore.get<QueueState>(SUPPORT_QUEUE_STORE_KEY);
    if (!existing?.tickets) return emptyState();
    return {
        version: 1,
        tickets: { ...existing.tickets }
    };
}

export async function saveSupportState(state: QueueState) {
    await DataStore.set(SUPPORT_QUEUE_STORE_KEY, {
        version: 1,
        tickets: { ...state.tickets }
    } satisfies QueueState);
}

export async function mutateSupportState(updater: (state: QueueState) => void) {
    const state = await loadSupportState();
    updater(state);
    await saveSupportState(state);
    return state;
}

export function getChannelLabel(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;

    return {
        channelName: channel?.name ? `#${channel.name}` : channelId,
        guildName: guild?.name
    };
}

export function channelMatches(channelId: string, options = DEFAULT_SUPPORT_TRACKER_OPTIONS) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;

    if (!channel.guild_id) return options.enabledForDms;
    if (!options.enabledForMatchingChannels) return false;

    try {
        return new RegExp(options.ticketNamePattern, "i").test(channel.name ?? "");
    } catch {
        return false;
    }
}

function buildDueAt(existing: TicketRecord | undefined, reason: string, options: SupportTrackerOptions, hours?: number) {
    if (existing?.status === "needsReply" && reason === "opened" && existing.dueAt)
        return existing.dueAt;

    return now() + dueInMs(hours ?? options.replySlaHours);
}

export async function markNeedsReply(channelId: string, reason: string, options = DEFAULT_SUPPORT_TRACKER_OPTIONS, meta: TicketMeta = {}, hours?: number, force = false) {
    if (!channelMatches(channelId, options)) return false;

    const state = await loadSupportState();
    const existing = state.tickets[channelId];
    if (existing?.status === "ignored" && !force) return false;

    const timestamp = now();
    const label = getChannelLabel(channelId);
    const dueAt = buildDueAt(existing, reason, options, hours);
    const isIncoming = reason === "incoming message";

    state.tickets[channelId] = {
        ...existing,
        channelId,
        ...label,
        status: "needsReply",
        reason,
        openedAt: existing?.openedAt ?? timestamp,
        lastViewedAt: reason === "opened" ? timestamp : existing?.lastViewedAt,
        lastIncomingAt: isIncoming ? timestamp : existing?.lastIncomingAt,
        lastActivityAt: timestamp,
        dueAt,
        snoozedUntil: undefined,
        unreadCount: isIncoming ? (existing?.status === "needsReply" ? (existing.unreadCount ?? 0) + 1 : 1) : existing?.unreadCount ?? 0,
        lastAuthorName: meta.authorName ?? existing?.lastAuthorName,
        lastSnippet: meta.snippet ?? existing?.lastSnippet,
        lastMessageId: meta.messageId ?? existing?.lastMessageId
    };

    await saveSupportState(state);
    return true;
}

export async function markDone(channelId: string, options = DEFAULT_SUPPORT_TRACKER_OPTIONS, reason = "reply sent") {
    const state = await loadSupportState();
    const existing = state.tickets[channelId];
    if (!existing && !channelMatches(channelId, options)) return false;

    const label = getChannelLabel(channelId);
    state.tickets[channelId] = {
        ...existing,
        channelId,
        ...label,
        status: "done",
        reason,
        lastReplyAt: now(),
        lastActivityAt: now(),
        dueAt: undefined,
        snoozedUntil: undefined,
        unreadCount: 0
    };

    await saveSupportState(state);
    return true;
}

export async function snoozeTicket(channelId: string, hours: number, options = DEFAULT_SUPPORT_TRACKER_OPTIONS) {
    const state = await loadSupportState();
    const existing = state.tickets[channelId];
    if (!existing && !channelMatches(channelId, options)) return false;

    const timestamp = now();
    const dueAt = timestamp + dueInMs(hours);
    const label = getChannelLabel(channelId);

    state.tickets[channelId] = {
        ...existing,
        channelId,
        ...label,
        status: "snoozed",
        reason: `snoozed for ${hours} hour(s)`,
        snoozedUntil: dueAt,
        dueAt,
        lastActivityAt: timestamp
    };

    await saveSupportState(state);
    return true;
}

export async function ignoreTicket(channelId: string, options = DEFAULT_SUPPORT_TRACKER_OPTIONS) {
    const state = await loadSupportState();
    const existing = state.tickets[channelId];
    if (!existing && !channelMatches(channelId, options)) return false;

    const label = getChannelLabel(channelId);
    state.tickets[channelId] = {
        ...existing,
        channelId,
        ...label,
        status: "ignored",
        reason: "ignored manually",
        dueAt: undefined,
        snoozedUntil: undefined,
        unreadCount: 0,
        lastActivityAt: now()
    };

    await saveSupportState(state);
    return true;
}

export async function clearDoneTickets() {
    return mutateSupportState(state => {
        for (const [channelId, ticket] of Object.entries(state.tickets)) {
            if (ticket.status === "done") delete state.tickets[channelId];
        }
    });
}

export async function clearIgnoredTickets() {
    return mutateSupportState(state => {
        for (const [channelId, ticket] of Object.entries(state.tickets)) {
            if (ticket.status === "ignored") delete state.tickets[channelId];
        }
    });
}

export function isActionableTicket(ticket: TicketRecord, timestamp = now()) {
    return ticket.status === "needsReply" || (ticket.status === "snoozed" && (ticket.snoozedUntil ?? 0) <= timestamp);
}

export function sortTickets(tickets: TicketRecord[]) {
    return [...tickets].sort((a, b) =>
        (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER)
        || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)
    );
}

export function getActionableTickets(state: QueueState, timestamp = now()) {
    return sortTickets(Object.values(state.tickets).filter(ticket => isActionableTicket(ticket, timestamp)));
}

export function getTicketStats(state: QueueState, timestamp = now()) {
    const tickets = Object.values(state.tickets);
    const actionable = getActionableTickets(state, timestamp);
    const overdue = actionable.filter(ticket => ticket.dueAt && ticket.dueAt <= timestamp);
    const dueSoon = actionable.filter(ticket => ticket.dueAt && ticket.dueAt > timestamp && ticket.dueAt <= timestamp + 60 * 60 * 1000);

    return {
        total: tickets.length,
        actionable: actionable.length,
        overdue: overdue.length,
        dueSoon: dueSoon.length,
        snoozed: tickets.filter(ticket => ticket.status === "snoozed" && (ticket.snoozedUntil ?? 0) > timestamp).length,
        done: tickets.filter(ticket => ticket.status === "done").length,
        ignored: tickets.filter(ticket => ticket.status === "ignored").length
    };
}

export function ticketScope(ticket: TicketRecord) {
    return ticket.guildName ? `${ticket.guildName} / ${ticket.channelName}` : ticket.channelName;
}

export function formatRelativeTime(timestamp?: number, reference = now()) {
    if (!timestamp) return "never";

    const delta = timestamp - reference;
    const abs = Math.abs(delta);
    const suffix = delta >= 0 ? "from now" : "ago";

    if (abs < 60 * 1000) return delta >= 0 ? "now" : "just now";

    const minutes = Math.round(abs / 60000);
    if (minutes < 60) return delta >= 0 ? `in ${minutes}m` : `${minutes}m ${suffix}`;

    const hours = Math.round(minutes / 60);
    if (hours < 48) return delta >= 0 ? `in ${hours}h` : `${hours}h ${suffix}`;

    const days = Math.round(hours / 24);
    return delta >= 0 ? `in ${days}d` : `${days}d ${suffix}`;
}

export function formatDue(ticket: TicketRecord, reference = now()) {
    if (!ticket.dueAt) return "No deadline";
    if (ticket.dueAt <= reference) return `Overdue ${formatRelativeTime(ticket.dueAt, reference)}`;
    return `Due ${formatRelativeTime(ticket.dueAt, reference)}`;
}

export function openSupportTicket(channelId: string) {
    ChannelRouter.transitionToChannel(channelId);
}
