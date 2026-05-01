/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { ChannelStore, GuildStore, MessageStore } from "@webpack/common";

type ExportFormat = "json" | "csv" | "markdown";

const URL_RE = /\bhttps?:\/\/[^\s<>()"]+/gi;

interface LinkRecord {
    url: string;
    host: string;
    messageId: string;
    channelId: string;
    author: string;
    timestamp?: string;
    snippet: string;
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
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").slice(0, 80) || "discord-links";
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

function csvCell(value: unknown) {
    return `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
}

function collectLinks(channelId: string, uniqueOnly: boolean) {
    const records: LinkRecord[] = [];
    const seen = new Set<string>();

    for (const message of getCachedMessages(channelId)) {
        for (const rawUrl of message.content?.match(URL_RE) ?? []) {
            let host = "";
            try {
                host = new URL(rawUrl).hostname.toLowerCase();
            } catch {
                host = "";
            }

            const key = rawUrl.toLowerCase();
            if (uniqueOnly && seen.has(key)) continue;
            seen.add(key);

            records.push({
                url: rawUrl,
                host,
                messageId: message.id,
                channelId,
                author: message.author?.globalName || message.author?.username || message.author?.id || "Unknown",
                timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : undefined,
                snippet: (message.content ?? "").replace(/\s+/g, " ").slice(0, 160)
            });
        }
    }

    return records;
}

function markdown(records: LinkRecord[]) {
    return [
        "# LinkCollector export",
        "",
        `Exported at: ${new Date().toISOString()}`,
        `Links: ${records.length}`,
        "",
        ...records.map(record => `- [${record.host || record.url}](${record.url}) - ${record.author} - ${record.timestamp ?? "unknown time"} - ${record.snippet}`)
    ].join("\n");
}

function csv(records: LinkRecord[]) {
    return [
        ["url", "host", "messageId", "channelId", "author", "timestamp", "snippet"].map(csvCell).join(","),
        ...records.map(record => [record.url, record.host, record.messageId, record.channelId, record.author, record.timestamp, record.snippet].map(csvCell).join(","))
    ].join("\n");
}

function exportLinks(channelId: string, format: ExportFormat, uniqueOnly: boolean) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;
    const baseName = safeFileName([guild?.name, channel?.name ?? channelId, "links", new Date().toISOString().replace(/[:.]/g, "-")].filter(Boolean).join("_"));
    const records = collectLinks(channelId, uniqueOnly);

    if (format === "csv") {
        downloadFile(`${baseName}.csv`, csv(records), "text/csv;charset=utf-8");
    } else if (format === "markdown") {
        downloadFile(`${baseName}.md`, markdown(records), "text/markdown;charset=utf-8");
    } else {
        downloadFile(`${baseName}.json`, JSON.stringify({
            exportedAt: new Date().toISOString(),
            exporter: "LinkCollector",
            tokenFree: true,
            uniqueOnly,
            linkCount: records.length,
            links: records
        }, null, 2), "application/json;charset=utf-8");
    }

    return records.length;
}

export default definePlugin({
    name: "LinkCollector",
    description: "Exports links from currently loaded messages as JSON, CSV, or Markdown.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Utility", "Chat"],
    enabledByDefault: true,
    dependencies: ["CommandsAPI"],

    commands: [{
        name: "collect-links",
        description: "Export links from the currently loaded chat cache",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "format",
                description: "Export format: json, csv, or markdown",
                type: ApplicationCommandOptionType.STRING,
                required: false
            },
            {
                name: "unique",
                description: "Only export each URL once",
                type: ApplicationCommandOptionType.BOOLEAN,
                required: false
            }
        ],
        execute: (opts, ctx) => {
            const rawFormat = String(findOption(opts, "format", "json")).toLowerCase();
            const format: ExportFormat = rawFormat === "csv" ? "csv" : rawFormat === "markdown" || rawFormat === "md" ? "markdown" : "json";
            const count = exportLinks(ctx.channel.id, format, Boolean(findOption(opts, "unique", true)));

            sendBotMessage(ctx.channel.id, {
                content: count
                    ? `Exported ${count} loaded link(s) as ${format}.`
                    : "No links found in the currently loaded chat cache."
            });
        }
    }]
});
