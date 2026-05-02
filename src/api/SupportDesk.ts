/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { ChannelRouter, ChannelStore, GuildStore } from "@webpack/common";

export type TicketStatus = "needsReply" | "done" | "snoozed" | "ignored";
export type SupportLanguage = "english" | "cjk" | "nonEnglishScript" | "unknown";
export type PreferredSupportLanguage = "english" | "all";

export interface TicketRecord {
    channelId: string;
    channelName: string;
    guildId?: string;
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
    language?: SupportLanguage;
    classifierScore?: number;
    classifierReasons?: string[];
}

export interface QueueState {
    version: 1;
    tickets: Record<string, TicketRecord>;
}

export interface SupportDeskConfig {
    version: 1;
    requireConfiguredGuilds: boolean;
    trackDms: boolean;
    preferredLanguage: PreferredSupportLanguage;
    classifierThreshold: number;
    trackedGuildIds: string[];
    mutedGuildIds: string[];
    trainedSupportChannelIds: string[];
    trainedNonSupportChannelIds: string[];
}

export interface SupportTrackerOptions {
    enabledForDms: boolean;
    enabledForMatchingChannels: boolean;
    ticketNamePattern: string;
    replySlaHours: number;
    smartClassification: boolean;
}

export interface TicketMeta {
    authorName?: string;
    snippet?: string;
    messageId?: string;
    textForClassification?: string;
}

export interface TicketClassification {
    isSupport: boolean;
    score: number;
    threshold: number;
    language: SupportLanguage;
    reasons: string[];
}

export const SUPPORT_QUEUE_STORE_KEY = "HeinoSupportQueueGuard:v1";
export const SUPPORT_CONFIG_STORE_KEY = "HeinoSupportDeskConfig:v1";

export const DEFAULT_SUPPORT_TRACKER_OPTIONS: SupportTrackerOptions = {
    enabledForDms: true,
    enabledForMatchingChannels: true,
    ticketNamePattern: "ticket|support|order|customer|case|help|billing|refund|invoice|shipping|delivery|license|activation",
    replySlaHours: 12,
    smartClassification: true
};

export const DEFAULT_SUPPORT_CONFIG: SupportDeskConfig = {
    version: 1,
    requireConfiguredGuilds: true,
    trackDms: true,
    preferredLanguage: "english",
    classifierThreshold: 4,
    trackedGuildIds: [],
    mutedGuildIds: [],
    trainedSupportChannelIds: [],
    trainedNonSupportChannelIds: []
};

const POSITIVE_NAME_RE = /\b(?:ticket|support|help|case|order|customer|client|billing|invoice|payment|refund|replace|warranty|delivery|shipping|tracking|rma|purchase|license|activation|reseller)\b/i;
const STRONG_TICKET_NAME_RE = /\b(?:ticket|case|order|support)[-_ ]?\d{2,}\b/i;
const NEGATIVE_NAME_RE = /\b(?:general|chat|off-topic|announcement|rules|staff|team|dev|development|marketing|log|logs|closed|archive|transcript|open-ticket-log|closed-ticket-log)\b/i;
const POSITIVE_MESSAGE_RE = /\b(?:help|issue|problem|not working|doesn't work|cant|can't|cannot|paid|payment|invoice|refund|order|customer|address|tracking|delivery|shipping|license|key|activation|reseller|support|ticket)\b/i;

function emptyState(): QueueState {
    return { version: 1, tickets: {} };
}

function unique(values: string[]) {
    return [...new Set(values.filter(Boolean))];
}

function getChannel(channelId: string): any {
    return ChannelStore.getChannel(channelId);
}

function getChannelGuildId(channelId: string) {
    return getChannel(channelId)?.guild_id as string | undefined;
}

function defaultConfig(config?: Partial<SupportDeskConfig>): SupportDeskConfig {
    return {
        ...DEFAULT_SUPPORT_CONFIG,
        ...config,
        trackedGuildIds: unique(config?.trackedGuildIds ?? []),
        mutedGuildIds: unique(config?.mutedGuildIds ?? []),
        trainedSupportChannelIds: unique(config?.trainedSupportChannelIds ?? []),
        trainedNonSupportChannelIds: unique(config?.trainedNonSupportChannelIds ?? [])
    };
}

export function createSupportTrackerOptions(raw: Partial<SupportTrackerOptions> | undefined): SupportTrackerOptions {
    return {
        enabledForDms: raw?.enabledForDms ?? DEFAULT_SUPPORT_TRACKER_OPTIONS.enabledForDms,
        enabledForMatchingChannels: raw?.enabledForMatchingChannels ?? DEFAULT_SUPPORT_TRACKER_OPTIONS.enabledForMatchingChannels,
        ticketNamePattern: raw?.ticketNamePattern || DEFAULT_SUPPORT_TRACKER_OPTIONS.ticketNamePattern,
        replySlaHours: Number(raw?.replySlaHours) || DEFAULT_SUPPORT_TRACKER_OPTIONS.replySlaHours,
        smartClassification: raw?.smartClassification ?? DEFAULT_SUPPORT_TRACKER_OPTIONS.smartClassification
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

export async function loadSupportConfig(): Promise<SupportDeskConfig> {
    return defaultConfig(await DataStore.get<Partial<SupportDeskConfig>>(SUPPORT_CONFIG_STORE_KEY));
}

export async function saveSupportConfig(config: SupportDeskConfig) {
    await DataStore.set(SUPPORT_CONFIG_STORE_KEY, defaultConfig(config));
}

export async function mutateSupportState(updater: (state: QueueState) => void) {
    const state = await loadSupportState();
    updater(state);
    await saveSupportState(state);
    return state;
}

export async function mutateSupportConfig(updater: (config: SupportDeskConfig) => void) {
    const config = await loadSupportConfig();
    updater(config);
    await saveSupportConfig(config);
    return config;
}

export async function addSupportGuild(guildId: string) {
    return mutateSupportConfig(config => {
        config.trackedGuildIds = unique([...config.trackedGuildIds, guildId]);
        config.mutedGuildIds = config.mutedGuildIds.filter(id => id !== guildId);
    });
}

export async function removeSupportGuild(guildId: string) {
    return mutateSupportConfig(config => {
        config.trackedGuildIds = config.trackedGuildIds.filter(id => id !== guildId);
    });
}

export async function setTrackDms(trackDms: boolean) {
    return mutateSupportConfig(config => {
        config.trackDms = trackDms;
    });
}

export async function setPreferredLanguage(preferredLanguage: PreferredSupportLanguage) {
    return mutateSupportConfig(config => {
        config.preferredLanguage = preferredLanguage;
    });
}

export async function trainSupportChannel(channelId: string, isSupport: boolean) {
    return mutateSupportConfig(config => {
        if (isSupport) {
            config.trainedSupportChannelIds = unique([...config.trainedSupportChannelIds, channelId]);
            config.trainedNonSupportChannelIds = config.trainedNonSupportChannelIds.filter(id => id !== channelId);
        } else {
            config.trainedNonSupportChannelIds = unique([...config.trainedNonSupportChannelIds, channelId]);
            config.trainedSupportChannelIds = config.trainedSupportChannelIds.filter(id => id !== channelId);
        }
    });
}

export async function forgetTrainedChannel(channelId: string) {
    return mutateSupportConfig(config => {
        config.trainedSupportChannelIds = config.trainedSupportChannelIds.filter(id => id !== channelId);
        config.trainedNonSupportChannelIds = config.trainedNonSupportChannelIds.filter(id => id !== channelId);
    });
}

export function getChannelLabel(channelId: string) {
    const channel = getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;

    return {
        channelName: channel?.name ? `#${channel.name}` : channelId,
        guildId: channel?.guild_id as string | undefined,
        guildName: guild?.name
    };
}

export function getConfiguredGuilds(config: SupportDeskConfig) {
    return config.trackedGuildIds.map(id => ({
        id,
        name: GuildStore.getGuild(id)?.name ?? id
    }));
}

export function getCurrentChannelSource(channelId: string | undefined) {
    if (!channelId) return { isDm: false } as const;
    const channel = getChannel(channelId);
    if (!channel) return { isDm: false } as const;
    if (!channel.guild_id) return { isDm: true, channel } as const;
    const guild = GuildStore.getGuild(channel.guild_id);
    return {
        isDm: false,
        channel,
        guildId: channel.guild_id as string,
        guildName: guild?.name ?? channel.guild_id as string
    } as const;
}

export function sourceAllowsChannel(channelId: string, config = DEFAULT_SUPPORT_CONFIG) {
    const channel = getChannel(channelId);
    if (!channel) return false;
    if (!channel.guild_id) return config.trackDms;
    if (config.mutedGuildIds.includes(channel.guild_id)) return false;
    if (!config.requireConfiguredGuilds) return true;
    return config.trackedGuildIds.includes(channel.guild_id);
}

export function sourceAllowsTicket(ticket: TicketRecord, config = DEFAULT_SUPPORT_CONFIG) {
    const guildId = ticket.guildId ?? getChannelGuildId(ticket.channelId);
    if (!guildId && ticket.guildName) return !config.requireConfiguredGuilds;
    if (!guildId) return config.trackDms;
    if (config.mutedGuildIds.includes(guildId)) return false;
    if (!config.requireConfiguredGuilds) return true;
    return config.trackedGuildIds.includes(guildId);
}

export function detectSupportLanguage(...parts: Array<string | undefined>) {
    const text = parts.filter(Boolean).join(" ");
    if (!text.trim()) return "unknown";

    const cjk = text.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g)?.length ?? 0;
    const otherScript = text.match(/[\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\uAC00-\uD7AF]/g)?.length ?? 0;
    const latin = text.match(/[A-Za-z]/g)?.length ?? 0;

    if (cjk >= 2 && cjk >= latin / 2) return "cjk";
    if (otherScript >= 3 && otherScript > latin / 2) return "nonEnglishScript";
    if (latin >= 5) return "english";
    if (cjk >= 2) return "cjk";
    return "unknown";
}

export function languageAllowed(language: SupportLanguage, config = DEFAULT_SUPPORT_CONFIG) {
    if (config.preferredLanguage === "all") return true;
    return language !== "cjk" && language !== "nonEnglishScript";
}

function parentChannelName(channel: any) {
    if (!channel?.parent_id) return "";
    return getChannel(channel.parent_id)?.name ?? "";
}

function matchConfiguredPattern(text: string, pattern: string) {
    try {
        return new RegExp(pattern, "i").test(text);
    } catch {
        return POSITIVE_NAME_RE.test(text);
    }
}

export function classifySupportChannel(channelId: string, meta: TicketMeta = {}, config = DEFAULT_SUPPORT_CONFIG, options = DEFAULT_SUPPORT_TRACKER_OPTIONS, force = false): TicketClassification {
    const channel = getChannel(channelId);
    const label = getChannelLabel(channelId);
    const channelText = [
        label.channelName,
        label.guildName,
        channel?.topic,
        parentChannelName(channel),
        meta.textForClassification,
        meta.snippet
    ].filter(Boolean).join(" ");
    const language = detectSupportLanguage(channelText);
    const threshold = config.classifierThreshold;
    const reasons: string[] = [];

    if (!channel) return { isSupport: false, score: 0, threshold, language, reasons: ["channel not loaded"] };
    if (force) return { isSupport: true, score: 99, threshold, language, reasons: ["manual"] };
    if (!sourceAllowsChannel(channelId, config)) return { isSupport: false, score: 0, threshold, language, reasons: ["source not enabled"] };
    if (!languageAllowed(language, config)) return { isSupport: false, score: 0, threshold, language, reasons: [`language filtered: ${language}`] };
    if (config.trainedNonSupportChannelIds.includes(channelId)) return { isSupport: false, score: -99, threshold, language, reasons: ["trained as not support"] };
    if (config.trainedSupportChannelIds.includes(channelId)) return { isSupport: true, score: 99, threshold, language, reasons: ["trained as support"] };
    if (!channel.guild_id) return { isSupport: config.trackDms, score: config.trackDms ? threshold : 0, threshold, language, reasons: ["dm"] };
    if (!options.enabledForMatchingChannels) return { isSupport: false, score: 0, threshold, language, reasons: ["guild channel tracking disabled"] };

    let score = 0;
    const nameText = [channel.name, parentChannelName(channel)].filter(Boolean).join(" ");

    if (STRONG_TICKET_NAME_RE.test(nameText)) {
        score += 6;
        reasons.push("numbered ticket/case/order channel");
    }

    if (matchConfiguredPattern(nameText, options.ticketNamePattern) || POSITIVE_NAME_RE.test(nameText)) {
        score += options.smartClassification ? 4 : 6;
        reasons.push("support-like channel/category name");
    }

    if (POSITIVE_NAME_RE.test(channelText) && !POSITIVE_NAME_RE.test(nameText)) {
        score += 2;
        reasons.push("support-like topic/context");
    }

    if (POSITIVE_MESSAGE_RE.test(meta.textForClassification ?? "")) {
        score += 2;
        reasons.push("support-like message text");
    }

    if (NEGATIVE_NAME_RE.test(nameText)) {
        score -= 6;
        reasons.push("non-ticket/log/general channel name");
    }

    if (config.trackedGuildIds.includes(channel.guild_id) && score > 0) {
        score += 1;
        reasons.push("configured support workspace");
    }

    if (!options.smartClassification && !matchConfiguredPattern(nameText, options.ticketNamePattern)) {
        score = 0;
        reasons.push("strict pattern mode");
    }

    return {
        isSupport: score >= threshold,
        score,
        threshold,
        language,
        reasons: reasons.length ? reasons : ["no support signals"]
    };
}

export function channelMatches(channelId: string, options = DEFAULT_SUPPORT_TRACKER_OPTIONS, config = DEFAULT_SUPPORT_CONFIG, meta: TicketMeta = {}, force = false) {
    return classifySupportChannel(channelId, meta, config, options, force).isSupport;
}

function buildDueAt(existing: TicketRecord | undefined, reason: string, options: SupportTrackerOptions, hours?: number) {
    if (existing?.status === "needsReply" && reason === "opened" && existing.dueAt)
        return existing.dueAt;

    return now() + dueInMs(hours ?? options.replySlaHours);
}

export async function markNeedsReply(channelId: string, reason: string, options = DEFAULT_SUPPORT_TRACKER_OPTIONS, meta: TicketMeta = {}, hours?: number, force = false) {
    const config = await loadSupportConfig();
    const classification = classifySupportChannel(channelId, meta, config, options, force);
    if (!classification.isSupport) return false;

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
        lastMessageId: meta.messageId ?? existing?.lastMessageId,
        language: classification.language,
        classifierScore: classification.score,
        classifierReasons: classification.reasons
    };

    await saveSupportState(state);
    return true;
}

export async function markDone(channelId: string, options = DEFAULT_SUPPORT_TRACKER_OPTIONS, reason = "reply sent") {
    const state = await loadSupportState();
    const existing = state.tickets[channelId];
    const config = await loadSupportConfig();
    if (!existing && !channelMatches(channelId, options, config)) return false;

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
    const config = await loadSupportConfig();
    if (!existing && !channelMatches(channelId, options, config)) return false;

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

export async function ignoreTicket(channelId: string, options = DEFAULT_SUPPORT_TRACKER_OPTIONS, train = true) {
    const state = await loadSupportState();
    const existing = state.tickets[channelId];
    const config = await loadSupportConfig();
    if (!existing && !channelMatches(channelId, options, config)) return false;

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
    if (train) await trainSupportChannel(channelId, false);
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

export async function clearOutOfScopeTickets() {
    const config = await loadSupportConfig();
    return mutateSupportState(state => {
        for (const [channelId, ticket] of Object.entries(state.tickets)) {
            if (!sourceAllowsTicket(ticket, config) || !languageAllowed(ticket.language ?? "unknown", config))
                delete state.tickets[channelId];
        }
    });
}

export function isActionableTicket(ticket: TicketRecord, timestamp = now()) {
    return ticket.status === "needsReply" || (ticket.status === "snoozed" && (ticket.snoozedUntil ?? 0) <= timestamp);
}

export function getVisibleTickets(state: QueueState, config = DEFAULT_SUPPORT_CONFIG) {
    return Object.values(state.tickets).filter(ticket =>
        sourceAllowsTicket(ticket, config)
        && languageAllowed(ticket.language ?? "unknown", config)
    );
}

export function sortTickets(tickets: TicketRecord[]) {
    return [...tickets].sort((a, b) =>
        (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER)
        || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)
    );
}

export function getActionableTickets(state: QueueState, timestamp = now(), config = DEFAULT_SUPPORT_CONFIG) {
    return sortTickets(getVisibleTickets(state, config).filter(ticket => isActionableTicket(ticket, timestamp)));
}

export function getTicketStats(state: QueueState, timestamp = now(), config = DEFAULT_SUPPORT_CONFIG) {
    const tickets = getVisibleTickets(state, config);
    const actionable = getActionableTickets(state, timestamp, config);
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

    if (abs < 60 * 1000) return delta >= 0 ? "now" : "just now";

    const minutes = Math.round(abs / 60000);
    if (minutes < 60) return delta >= 0 ? `in ${minutes}m` : `${minutes}m ago`;

    const hours = Math.round(minutes / 60);
    if (hours < 48) return delta >= 0 ? `in ${hours}h` : `${hours}h ago`;

    const days = Math.round(hours / 24);
    return delta >= 0 ? `in ${days}d` : `${days}d ago`;
}

export function formatDue(ticket: TicketRecord, reference = now()) {
    if (!ticket.dueAt) return "No deadline";
    if (ticket.dueAt <= reference) return `Overdue ${formatRelativeTime(ticket.dueAt, reference)}`;
    return `Due ${formatRelativeTime(ticket.dueAt, reference)}`;
}

export function openSupportTicket(channelId: string) {
    ChannelRouter.transitionToChannel(channelId);
}
