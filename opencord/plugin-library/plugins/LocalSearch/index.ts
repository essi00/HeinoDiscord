/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { ChannelStore, GuildStore, MessageStore } from "@webpack/common";

type ExportFormat = "json" | "markdown";

interface SearchResult {
    messageId: string;
    channelId: string;
    author: string;
    timestamp?: string;
    content: string;
}

function uniqueMessages(messages: Message[]) {
    const byId = new Map<string, Message>();
    for (const message of messages) if (message?.id) byId.set(message.id, message);
    return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id));
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

function safeFileName(name: string) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").slice(0, 80) || "discord-search";
}

function downloadFile(fileName: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function escapeMarkdown(text: string) {
    return text.replaceAll("\\", "\\\\").replaceAll("`", "\\`");
}

function searchMessages(channelId: string, query: string, caseSensitive: boolean) {
    const needle = caseSensitive ? query : query.toLowerCase();
    const results: SearchResult[] = [];

    for (const message of getCachedMessages(channelId)) {
        const content = message.content ?? "";
        const haystack = caseSensitive ? content : content.toLowerCase();
        if (!haystack.includes(needle)) continue;

        results.push({
            messageId: message.id,
            channelId,
            author: message.author?.globalName || message.author?.username || message.author?.id || "Unknown",
            timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : undefined,
            content
        });
    }

    return results;
}

function markdown(query: string, results: SearchResult[]) {
    return [
        `# LocalSearch: ${query}`,
        "",
        `Exported at: ${new Date().toISOString()}`,
        `Results: ${results.length}`,
        "",
        ...results.map(result => [
            `## ${escapeMarkdown(result.author)} - ${result.timestamp ?? "unknown time"}`,
            "",
            `Message ID: ${result.messageId}`,
            "",
            escapeMarkdown(result.content || "_No text content_"),
            ""
        ].join("\n"))
    ].join("\n");
}

function exportResults(channelId: string, query: string, format: ExportFormat, caseSensitive: boolean) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;
    const baseName = safeFileName([guild?.name, channel?.name ?? channelId, "search", query.slice(0, 32), new Date().toISOString().replace(/[:.]/g, "-")].filter(Boolean).join("_"));
    const results = searchMessages(channelId, query, caseSensitive);

    if (format === "markdown") {
        downloadFile(`${baseName}.md`, markdown(query, results), "text/markdown;charset=utf-8");
    } else {
        downloadFile(`${baseName}.json`, JSON.stringify({
            exportedAt: new Date().toISOString(),
            exporter: "LocalSearch",
            tokenFree: true,
            query,
            caseSensitive,
            resultCount: results.length,
            results
        }, null, 2), "application/json;charset=utf-8");
    }

    return results.length;
}

export default definePlugin({
    name: "LocalSearch",
    description: "Searches currently loaded messages locally and exports matching results.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Utility", "Chat"],
    enabledByDefault: true,
    dependencies: ["CommandsAPI"],

    commands: [{
        name: "local-search",
        description: "Search the currently loaded chat cache",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "query",
                description: "Text to search for",
                type: ApplicationCommandOptionType.STRING,
                required: true
            },
            {
                name: "format",
                description: "Export format: json or markdown",
                type: ApplicationCommandOptionType.STRING,
                required: false
            },
            {
                name: "case-sensitive",
                description: "Use case-sensitive matching",
                type: ApplicationCommandOptionType.BOOLEAN,
                required: false
            }
        ],
        execute: (opts, ctx) => {
            const query = String(findOption(opts, "query", "")).trim();
            if (!query) {
                sendBotMessage(ctx.channel.id, { content: "Provide a non-empty search query." });
                return;
            }

            const rawFormat = String(findOption(opts, "format", "json")).toLowerCase();
            const format: ExportFormat = rawFormat === "markdown" || rawFormat === "md" ? "markdown" : "json";
            const caseSensitive = Boolean(findOption(opts, "case-sensitive", false));
            const count = exportResults(ctx.channel.id, query, format, caseSensitive);

            sendBotMessage(ctx.channel.id, {
                content: count
                    ? `Exported ${count} local search result(s) as ${format}.`
                    : "No matches found in the currently loaded chat cache."
            });
        }
    }]
});
