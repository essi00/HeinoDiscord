/*
 * Vencord UserPlugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { ChannelStore, GuildStore, MessageStore } from "@webpack/common";

type ExportFormat = "json" | "markdown";

interface ExportedAttachment {
    id: string;
    filename: string;
    url: string;
    proxyUrl?: string;
    size?: number;
    contentType?: string;
}

interface ExportedMessage {
    id: string;
    channelId: string;
    guildId?: string;
    authorId?: string;
    authorUsername?: string;
    authorGlobalName?: string | null;
    timestamp?: string;
    editedTimestamp?: string | null;
    content: string;
    attachments: ExportedAttachment[];
    embeds: Array<{
        title?: string;
        description?: string;
        url?: string;
        type?: string;
    }>;
    replyTo?: string;
}

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

function toExportedMessage(message: Message, guildId?: string): ExportedMessage {
    return {
        id: message.id,
        channelId: message.channel_id,
        guildId,
        authorId: message.author?.id,
        authorUsername: message.author?.username,
        authorGlobalName: message.author?.globalName ?? null,
        timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : undefined,
        editedTimestamp: message.editedTimestamp ? new Date(message.editedTimestamp).toISOString() : null,
        content: message.content ?? "",
        attachments: (message.attachments ?? []).map(a => ({
            id: a.id,
            filename: a.filename,
            url: a.url,
            proxyUrl: a.proxy_url,
            size: a.size,
            contentType: a.content_type
        })),
        embeds: (message.embeds ?? []).map(e => ({
            title: e.title,
            description: e.rawDescription ?? e.description,
            url: e.url,
            type: e.type
        })),
        replyTo: message.messageReference?.message_id
    };
}

function escapeMarkdown(text: string) {
    return text
        .replaceAll("\\", "\\\\")
        .replaceAll("`", "\\`");
}

function formatMarkdown(messages: ExportedMessage[], channelName: string) {
    const lines = [
        `# Discord export: ${channelName}`,
        "",
        `Exported at: ${new Date().toISOString()}`,
        `Messages: ${messages.length}`,
        ""
    ];

    for (const message of messages) {
        const author = message.authorGlobalName || message.authorUsername || message.authorId || "Unknown";
        lines.push(`## ${escapeMarkdown(author)} - ${message.timestamp ?? "unknown time"}`);
        if (message.replyTo) lines.push(`Reply to: ${message.replyTo}`);
        lines.push("");
        lines.push(message.content ? escapeMarkdown(message.content) : "_No text content_");

        for (const attachment of message.attachments) {
            lines.push(`- Attachment: [${escapeMarkdown(attachment.filename)}](${attachment.url})`);
        }

        for (const embed of message.embeds) {
            if (embed.title || embed.description || embed.url) {
                lines.push(`- Embed: ${escapeMarkdown([embed.title, embed.description, embed.url].filter(Boolean).join(" - "))}`);
            }
        }

        lines.push("");
    }

    return lines.join("\n");
}

function safeFileName(name: string) {
    return name
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 80) || "discord-channel";
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

function exportChannel(channelId: string, format: ExportFormat) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;
    const channelName = channel?.name ?? channelId;
    const messages = getCachedMessages(channelId).map(m => toExportedMessage(m, channel?.guild_id));

    const baseName = safeFileName([
        guild?.name,
        channelName,
        new Date().toISOString().replace(/[:.]/g, "-")
    ].filter(Boolean).join("_"));

    if (format === "markdown") {
        downloadFile(`${baseName}.md`, formatMarkdown(messages, channelName), "text/markdown;charset=utf-8");
    } else {
        downloadFile(`${baseName}.json`, JSON.stringify({
            exportedAt: new Date().toISOString(),
            exporter: "LocalChatExporter",
            tokenFree: true,
            channel: {
                id: channelId,
                name: channelName,
                guildId: channel?.guild_id,
                guildName: guild?.name
            },
            messageCount: messages.length,
            messages
        }, null, 2), "application/json;charset=utf-8");
    }

    return messages.length;
}

export default definePlugin({
    name: "LocalChatExporter",
    description: "Token-free local export of the currently cached messages in this channel as JSON or Markdown.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Utility", "Chat"],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "export-local-chat",
            description: "Export currently cached messages from this channel without using a Discord token",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{
                name: "format",
                description: "Export format: json or markdown",
                type: ApplicationCommandOptionType.STRING,
                required: false
            }],
            execute: (opts, ctx) => {
                const rawFormat = String(findOption(opts, "format", "json")).toLowerCase();
                const format: ExportFormat = rawFormat === "markdown" || rawFormat === "md" ? "markdown" : "json";
                const count = exportChannel(ctx.channel.id, format);

                sendBotMessage(ctx.channel.id, {
                    content: count
                        ? `Exported ${count} cached message(s) as ${format}.`
                        : "No cached messages found. Scroll/load the channel first, then run the command again."
                });
            }
        }
    ]
});
