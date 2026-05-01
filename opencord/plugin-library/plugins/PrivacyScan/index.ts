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

interface Finding {
    type: string;
    messageId: string;
    author: string;
    timestamp?: string;
    redacted: string;
}

interface ScanReport {
    exportedAt: string;
    channelId: string;
    scannedMessages: number;
    counts: Array<[string, number]>;
    findings: Finding[];
}

const PATTERNS = [
    { type: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { type: "phone-like", re: /(?:\+?\d[\d\s().-]{7,}\d)/g },
    { type: "ipv4", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    { type: "discord-invite", re: /\b(?:https?:\/\/)?(?:discord\.gg|discord\.com\/invite)\/[a-z0-9-]+\b/gi },
    { type: "secret-like", re: /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g }
];

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

function redact(value: string) {
    if (value.length <= 6) return "[redacted]";
    return `${value.slice(0, 3)}...${value.slice(-3)}`;
}

function safeFileName(name: string) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").slice(0, 80) || "discord-privacy-scan";
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

function scan(channelId: string, sampleLimit: number): ScanReport {
    const findings: Finding[] = [];
    const counts = new Map<string, number>();
    const messages = getCachedMessages(channelId);

    for (const message of messages) {
        const content = message.content ?? "";
        for (const { type, re } of PATTERNS) {
            re.lastIndex = 0;
            for (const match of content.matchAll(re)) {
                counts.set(type, (counts.get(type) ?? 0) + 1);
                if (findings.length >= sampleLimit) continue;

                findings.push({
                    type,
                    messageId: message.id,
                    author: message.author?.globalName || message.author?.username || message.author?.id || "Unknown",
                    timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : undefined,
                    redacted: redact(match[0])
                });
            }
        }
    }

    return {
        exportedAt: new Date().toISOString(),
        channelId,
        scannedMessages: messages.length,
        counts: [...counts.entries()].sort((a, b) => b[1] - a[1]),
        findings
    };
}

function reportToMarkdown(report: ScanReport) {
    const counts = report.counts.map(([type, count]) => `- ${type}: ${count}`).join("\n") || "- No flagged patterns";
    const samples = report.findings.map(finding => [
        `## ${escapeMarkdown(finding.type)} - ${finding.timestamp ?? "unknown time"}`,
        "",
        `Message ID: ${finding.messageId}`,
        `Author: ${escapeMarkdown(finding.author)}`,
        `Redacted match: \`${escapeMarkdown(finding.redacted)}\``,
        ""
    ].join("\n")).join("\n") || "- No redacted samples";

    return [
        "# PrivacyScan local report",
        "",
        `Exported at: ${report.exportedAt}`,
        `Channel ID: ${report.channelId}`,
        `Scanned loaded messages: ${report.scannedMessages}`,
        "",
        "## Pattern counts",
        "",
        counts,
        "",
        "## Redacted samples",
        "",
        samples,
        "",
        "Only the loaded local message cache was scanned. No raw sensitive matches are exported."
    ].join("\n");
}

function exportReport(channelId: string, sampleLimit: number, format: ExportFormat) {
    const channel = ChannelStore.getChannel(channelId);
    const guild = channel?.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;
    const baseName = safeFileName([guild?.name, channel?.name ?? channelId, "privacy-scan", new Date().toISOString().replace(/[:.]/g, "-")].filter(Boolean).join("_"));
    const report = scan(channelId, sampleLimit);

    if (format === "markdown") {
        downloadFile(`${baseName}.md`, reportToMarkdown(report), "text/markdown;charset=utf-8");
    } else {
        downloadFile(`${baseName}.json`, JSON.stringify({
            ...report,
            exporter: "PrivacyScan",
            tokenFree: true,
            redacted: true
        }, null, 2), "application/json;charset=utf-8");
    }

    return report;
}

function formatReport(channelId: string, sampleLimit: number) {
    const report = scan(channelId, sampleLimit);
    const counts = report.counts.map(([type, count]) => `- ${type}: **${count}**`).join("\n") || "- No flagged patterns";
    const samples = report.findings.map(finding => `- ${finding.type}: \`${finding.redacted}\` by ${finding.author} (${finding.timestamp ?? "unknown time"})`).join("\n") || "- No samples";

    return [
        "**PrivacyScan local report**",
        `Scanned loaded messages: **${report.scannedMessages}**`,
        "",
        "**Pattern counts**",
        counts,
        "",
        "**Redacted samples**",
        samples,
        "",
        "Only loaded local cache was scanned. Samples are redacted and not uploaded."
    ].join("\n").slice(0, 1900);
}

export default definePlugin({
    name: "PrivacyScan",
    description: "Locally scans loaded messages for common sensitive-data patterns with redacted output.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Privacy", "Utility"],
    enabledByDefault: true,
    dependencies: ["CommandsAPI"],

    commands: [{
        name: "privacy-scan",
        description: "Scan loaded local messages for sensitive-data patterns",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "samples",
                description: "How many redacted samples to show or export",
                type: ApplicationCommandOptionType.INTEGER,
                required: false
            },
            {
                name: "export",
                description: "Download a redacted JSON/Markdown report",
                type: ApplicationCommandOptionType.BOOLEAN,
                required: false
            },
            {
                name: "format",
                description: "Export format: json or markdown",
                type: ApplicationCommandOptionType.STRING,
                required: false
            }
        ],
        execute: (opts, ctx) => {
            const sampleLimit = Math.max(0, Math.min(12, Number(findOption(opts, "samples", 6)) || 6));
            const shouldExport = Boolean(findOption(opts, "export", false));

            if (shouldExport) {
                const rawFormat = String(findOption(opts, "format", "json")).toLowerCase();
                const format: ExportFormat = rawFormat === "markdown" || rawFormat === "md" ? "markdown" : "json";
                const report = exportReport(ctx.channel.id, sampleLimit, format);

                sendBotMessage(ctx.channel.id, {
                    content: `Exported redacted PrivacyScan report as ${format}. Scanned ${report.scannedMessages} loaded message(s).`
                });
                return;
            }

            sendBotMessage(ctx.channel.id, {
                content: formatReport(ctx.channel.id, sampleLimit)
            });
        }
    }]
});
