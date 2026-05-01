/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { ChannelStore, GuildStore, MessageStore } from "@webpack/common";

const URL_RE = /\bhttps?:\/\/[^\s<>()"]+/gi;

function uniqueMessages(messages: Message[]) {
    const byId = new Map<string, Message>();

    for (const message of messages) {
        if (message?.id) byId.set(message.id, message);
    }

    return [...byId.values()].sort((a, b) => {
        const at = a.timestamp ? new Date(a.timestamp).getTime() : Number(a.id);
        const bt = b.timestamp ? new Date(b.timestamp).getTime() : Number(b.id);
        return at - bt;
    });
}

function getCachedMessages(channelId: string) {
    const channelMessages = MessageStore.getMessages(channelId);
    const raw: Message[] = [];

    if (Array.isArray(channelMessages?._array)) raw.push(...channelMessages._array);
    if (Array.isArray(channelMessages?._before?._messages)) raw.push(...channelMessages._before._messages);
    if (Array.isArray(channelMessages?._after?._messages)) raw.push(...channelMessages._after._messages);
    if (channelMessages?._map) raw.push(...Object.values(channelMessages._map) as Message[]);

    return uniqueMessages(raw);
}

function displayAuthor(message: Message) {
    return message.author?.globalName || message.author?.username || message.author?.id || "Unknown";
}

function formatDate(value: string | Date | undefined) {
    if (!value) return "unknown";
    return new Date(value).toLocaleString();
}

function clampMessage(content: string) {
    return content.length > 1900 ? `${content.slice(0, 1880)}...` : content;
}

function buildStats(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;
    const messages = getCachedMessages(channelId);
    const authorCounts = new Map<string, number>();
    const hourlyCounts = new Map<number, number>();
    let links = 0;
    let attachments = 0;
    let embeds = 0;
    let reactions = 0;

    for (const message of messages) {
        authorCounts.set(displayAuthor(message), (authorCounts.get(displayAuthor(message)) ?? 0) + 1);
        links += message.content?.match(URL_RE)?.length ?? 0;
        attachments += message.attachments?.length ?? 0;
        embeds += message.embeds?.length ?? 0;
        reactions += message.reactions?.reduce((sum, reaction) => sum + (reaction.count ?? 0), 0) ?? 0;

        if (message.timestamp) {
            const hour = new Date(message.timestamp).getHours();
            hourlyCounts.set(hour, (hourlyCounts.get(hour) ?? 0) + 1);
        }
    }

    const topAuthors = [...authorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, count], index) => `${index + 1}. ${name}: ${count}`)
        .join("\n") || "No authors";

    const busiestHour = [...hourlyCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const first = messages[0];
    const last = messages[messages.length - 1];

    return clampMessage([
        `**ChatStats: ${guild?.name ? `${guild.name} / ` : ""}${channel?.name ?? channelId}**`,
        `Loaded messages: **${messages.length}**`,
        `Unique authors: **${authorCounts.size}**`,
        `Time range: ${formatDate(first?.timestamp)} -> ${formatDate(last?.timestamp)}`,
        `Links: **${links}** | Attachments: **${attachments}** | Embeds: **${embeds}** | Reactions: **${reactions}**`,
        busiestHour ? `Busiest loaded hour: **${String(busiestHour[0]).padStart(2, "0")}:00** (${busiestHour[1]} messages)` : "Busiest loaded hour: unknown",
        "",
        "**Top authors in loaded cache**",
        topAuthors
    ].join("\n"));
}

export default definePlugin({
    name: "ChatStats",
    description: "Local statistics for the currently loaded messages in a channel or DM.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Utility", "Chat"],
    enabledByDefault: true,
    dependencies: ["CommandsAPI"],

    commands: [{
        name: "chat-stats",
        description: "Show local stats for the currently loaded chat cache",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_, ctx) => {
            sendBotMessage(ctx.channel.id, {
                content: buildStats(ctx.channel.id)
            });
        }
    }]
});
