/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { MessageStore, SelectedChannelStore, UserStore } from "@webpack/common";

interface RiskFinding {
    type: string;
    detail: string;
    score: number;
}

const settings = definePluginSettings({
    warnIncoming: {
        type: OptionType.BOOLEAN,
        description: "Warn locally when a visible incoming message looks like a scam, RAT, token theft, or fake support attempt.",
        default: true
    },
    blockOutgoingHighRisk: {
        type: OptionType.BOOLEAN,
        description: "Block outgoing high-risk links, token-shaped secrets, and strongly combined scam signals unless you add [allow-risk].",
        default: true
    },
    strictMode: {
        type: OptionType.BOOLEAN,
        description: "Lower the incoming warning threshold for suspicious support/security wording.",
        default: true
    },
    allowDiscordCdnFiles: {
        type: OptionType.BOOLEAN,
        description: "Treat Discord CDN file links as lower risk. Keep disabled if you fear RAT/malware attachments.",
        default: false
    }
});

const URL_RE = /\bhttps?:\/\/[^\s<>()"]+/gi;
const DISCORD_MARKUP_RE = /<(?:(?:@!?|@&|#)\d{17,20}|a?:[A-Za-z0-9_~-]{2,32}:\d{17,20}|t:\d{1,13}(?::[tTdDfFR])?)>/g;
const DANGEROUS_EXT_RE = /\.(?:exe|scr|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|hta|msi|msp|apk|jar|com|pif|lnk|iso|img|dmg|pkg)(?:[?#]|$)/i;
const ARCHIVE_EXT_RE = /\.(?:zip|rar|7z|tar|gz)(?:[?#]|$)/i;
const IP_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const SAFE_HOSTS = new Set([
    "discord.com",
    "discord.gg",
    "discordapp.com",
    "canary.discord.com",
    "ptb.discord.com"
]);
const CDN_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);
const SUPPORT_SCAM_RE = /\b(?:accidentally reported|false report|discord staff|trust\s*&?\s*safety|support admin|verify your account|account will be banned|appeal your ban|scan this qr|change your email|change your password|screen share|remote access)\b/i;
const MALWARE_SCRIPT_RE = /\b(?:powershell|cmd\.exe|run this script|paste this command|paste this into|disable antivirus|windows defender|download and run|extract and run|anydesk|teamviewer|remcos|rat\b|stealer|token grabber)\b/i;
const BAIT_RE = /\b(?:free nitro|nitro gift|steam gift|crypto airdrop|giveaway|wallet connect|seed phrase|private key|recovery phrase)\b/i;
const TOKEN_RE = /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g;
const OUTGOING_BLOCK_TYPES = new Set([
    "brand-lookalike-link",
    "dangerous-discord-cdn-file",
    "dangerous-file-link",
    "token-shaped-secret"
]);
const OUTGOING_COMBINED_RISK_TYPES = new Set([
    "archive-file-link",
    "lookalike-domain",
    "raw-ip-link"
]);
const warnedMessageIds = new Set<string>();

function hostLooksAllowed(host: string) {
    if (SAFE_HOSTS.has(host)) return true;
    if ([...SAFE_HOSTS].some(allowed => host.endsWith(`.${allowed}`))) return true;
    if (settings.store.allowDiscordCdnFiles && CDN_HOSTS.has(host)) return true;
    return false;
}

function languageScanContent(content: string) {
    return content
        .replace(URL_RE, " ")
        .replace(DISCORD_MARKUP_RE, " ");
}

function analyzeText(content: string) {
    const findings: RiskFinding[] = [];
    const urls = content.match(URL_RE) ?? [];
    const languageContent = languageScanContent(content);

    for (const rawUrl of urls) {
        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            continue;
        }

        const host = url.hostname.toLowerCase().replace(/\.$/, "");

        if (host.includes("xn--")) findings.push({ type: "lookalike-domain", detail: host, score: 4 });
        if (IP_RE.test(host)) findings.push({ type: "raw-ip-link", detail: host, score: 3 });
        if (!hostLooksAllowed(host) && /discord|nitro|steam|gift|support|verify/i.test(host)) {
            findings.push({ type: "brand-lookalike-link", detail: host, score: 5 });
        }
        if (CDN_HOSTS.has(host) && DANGEROUS_EXT_RE.test(url.pathname)) {
            findings.push({ type: "dangerous-discord-cdn-file", detail: url.pathname.split("/").pop() ?? host, score: 7 });
        } else if (DANGEROUS_EXT_RE.test(url.pathname)) {
            findings.push({ type: "dangerous-file-link", detail: url.pathname.split("/").pop() ?? host, score: 6 });
        } else if (ARCHIVE_EXT_RE.test(url.pathname)) {
            findings.push({ type: "archive-file-link", detail: url.pathname.split("/").pop() ?? host, score: 2 });
        }
    }

    if (SUPPORT_SCAM_RE.test(languageContent)) findings.push({ type: "fake-support-language", detail: "support/account pressure wording", score: 4 });
    if (MALWARE_SCRIPT_RE.test(languageContent)) findings.push({ type: "malware-script-language", detail: "script/download/remote access wording", score: 6 });
    if (BAIT_RE.test(languageContent)) findings.push({ type: "scam-bait-language", detail: "nitro/gift/crypto/seed wording", score: 4 });
    TOKEN_RE.lastIndex = 0;
    if (TOKEN_RE.test(content)) findings.push({ type: "token-shaped-secret", detail: "token-like string", score: 8 });

    return findings;
}

function score(findings: RiskFinding[]) {
    return findings.reduce((sum, finding) => sum + finding.score, 0);
}

function shouldWarn(findings: RiskFinding[]) {
    return score(findings) >= (settings.store.strictMode ? 4 : 7);
}

function shouldBlockOutgoing(findings: RiskFinding[]) {
    if (!findings.length) return false;
    if (findings.some(finding => OUTGOING_BLOCK_TYPES.has(finding.type))) return true;

    const hasMalwareLanguage = findings.some(finding => finding.type === "malware-script-language");
    const hasDeliveryRisk = findings.some(finding => OUTGOING_COMBINED_RISK_TYPES.has(finding.type));
    return hasMalwareLanguage && hasDeliveryRisk && score(findings) >= 7;
}

function summary(findings: RiskFinding[]) {
    return findings
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(finding => `- ${finding.type}: ${finding.detail}`)
        .join("\n");
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

function scanLoaded(channelId: string) {
    const rows: string[] = [];
    for (const message of getCachedMessages(channelId)) {
        const content = [
            message.content ?? "",
            ...(message.attachments ?? []).map(attachment => `${attachment.filename} ${attachment.url}`)
        ].join("\n");
        const findings = analyzeText(content);
        if (!shouldWarn(findings)) continue;

        const author = message.author?.globalName || message.author?.username || message.author?.id || "Unknown";
        rows.push(`**${author}** (${message.id}) score ${score(findings)}\n${summary(findings)}`);
    }

    return rows;
}

export default definePlugin({
    name: "ScamShield",
    description: "Local scam/RAT guard for fake support messages, suspicious links, dangerous file links, and token-shaped secrets.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Privacy", "Utility", "Chat"],
    enabledByDefault: true,
    dependencies: ["CommandsAPI"],
    settings,

    flux: {
        MESSAGE_CREATE({ message }: any) {
            if (!settings.store.warnIncoming || !message?.id || warnedMessageIds.has(message.id)) return;
            if (message.channel_id !== SelectedChannelStore.getChannelId?.()) return;
            if (message.author?.id && message.author.id === UserStore.getCurrentUser?.()?.id) return;

            const content = [
                message.content ?? "",
                ...(message.attachments ?? []).map((attachment: any) => `${attachment.filename} ${attachment.url}`)
            ].join("\n");
            const findings = analyzeText(content);
            if (!shouldWarn(findings)) return;

            warnedMessageIds.add(message.id);
            sendBotMessage(message.channel_id, {
                content: [
                    "**ScamShield warning**",
                    "This message looks risky. Do not run files/scripts, do not scan QR codes, and do not change account credentials from Discord chat instructions.",
                    "",
                    summary(findings)
                ].join("\n").slice(0, 1900)
            });
        }
    },

    onBeforeMessageSend(channelId, msg) {
        if (msg.content.includes("[allow-risk]")) {
            msg.content = msg.content.replace(/\s*\[allow-risk\]\s*/g, " ").trim();
            return;
        }

        const findings = analyzeText(msg.content);
        if (!settings.store.blockOutgoingHighRisk || !shouldBlockOutgoing(findings)) return;

        sendBotMessage(channelId, {
            content: [
                "**ScamShield blocked a risky outgoing message.**",
                "If you intentionally need to send it, add `[allow-risk]` once and send again.",
                "",
                summary(findings)
            ].join("\n")
        });

        return { cancel: true };
    },

    commands: [{
        name: "security-scan",
        description: "Scan loaded messages for scam/RAT patterns locally",
        inputType: ApplicationCommandInputType.BUILT_IN,
        execute: (_, ctx) => {
            const rows = scanLoaded(ctx.channel.id);
            sendBotMessage(ctx.channel.id, {
                content: rows.length
                    ? `**ScamShield loaded-message scan**\n\n${rows.slice(0, 8).join("\n\n")}`.slice(0, 1900)
                    : "ScamShield: no high-risk patterns found in loaded messages."
            });
        }
    }]
});
