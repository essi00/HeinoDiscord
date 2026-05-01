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

interface AttachmentRecord {
    id: string;
    filename: string;
    url: string;
    proxyUrl?: string;
    size?: number;
    contentType?: string;
    messageId: string;
    author: string;
    timestamp?: string;
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
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").slice(0, 80) || "discord-attachments";
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

function collectAttachments(channelId: string) {
    const records: AttachmentRecord[] = [];

    for (const message of getCachedMessages(channelId)) {
        for (const attachment of message.attachments ?? []) {
            records.push({
                id: attachment.id,
                filename: attachment.filename,
                url: attachment.url,
                proxyUrl: attachment.proxy_url,
                size: attachment.size,
                contentType: attachment.content_type,
                messageId: message.id,
                author: message.author?.globalName || message.author?.username || message.author?.id || "Unknown",
                timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : undefined
            });
        }
    }

    return records;
}

function markdown(records: AttachmentRecord[]) {
    return [
        "# AttachmentIndex export",
        "",
        `Exported at: ${new Date().toISOString()}`,
        `Attachments: ${records.length}`,
        "",
        ...records.map(record => `- [${record.filename}](${record.url}) - ${record.contentType || "unknown type"} - ${record.size ?? 0} bytes - ${record.author} - ${record.timestamp ?? "unknown time"}`)
    ].join("\n");
}

function csv(records: AttachmentRecord[]) {
    return [
        ["id", "filename", "url", "proxyUrl", "size", "contentType", "messageId", "author", "timestamp"].map(csvCell).join(","),
        ...records.map(record => [record.id, record.filename, record.url, record.proxyUrl, record.size, record.contentType, record.messageId, record.author, record.timestamp].map(csvCell).join(","))
    ].join("\n");
}

function exportAttachments(channelId: string, format: ExportFormat) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;
    const baseName = safeFileName([guild?.name, channel?.name ?? channelId, "attachments", new Date().toISOString().replace(/[:.]/g, "-")].filter(Boolean).join("_"));
    const records = collectAttachments(channelId);

    if (format === "csv") {
        downloadFile(`${baseName}.csv`, csv(records), "text/csv;charset=utf-8");
    } else if (format === "markdown") {
        downloadFile(`${baseName}.md`, markdown(records), "text/markdown;charset=utf-8");
    } else {
        downloadFile(`${baseName}.json`, JSON.stringify({
            exportedAt: new Date().toISOString(),
            exporter: "AttachmentIndex",
            tokenFree: true,
            attachmentCount: records.length,
            attachments: records
        }, null, 2), "application/json;charset=utf-8");
    }

    return records.length;
}

export default definePlugin({
    name: "AttachmentIndex",
    description: "Exports an index of attachments from currently loaded messages.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Utility", "Media"],
    enabledByDefault: true,
    dependencies: ["CommandsAPI"],

    commands: [{
        name: "attachment-index",
        description: "Export attachment metadata from the currently loaded chat cache",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [{
            name: "format",
            description: "Export format: json, csv, or markdown",
            type: ApplicationCommandOptionType.STRING,
            required: false
        }],
        execute: (opts, ctx) => {
            const rawFormat = String(findOption(opts, "format", "json")).toLowerCase();
            const format: ExportFormat = rawFormat === "csv" ? "csv" : rawFormat === "markdown" || rawFormat === "md" ? "markdown" : "json";
            const count = exportAttachments(ctx.channel.id, format);

            sendBotMessage(ctx.channel.id, {
                content: count
                    ? `Exported ${count} loaded attachment(s) as ${format}.`
                    : "No attachments found in the currently loaded chat cache."
            });
        }
    }]
});
