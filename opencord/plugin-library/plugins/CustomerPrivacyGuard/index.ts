/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

interface Finding {
    type: string;
    severity: "personal" | "high";
    count: number;
}

const settings = definePluginSettings({
    blockHighRiskSecrets: {
        type: OptionType.BOOLEAN,
        description: "Block outgoing messages containing token-shaped strings, private keys, seed phrases, or payment card-like numbers.",
        default: true
    },
    blockPersonalDataBursts: {
        type: OptionType.BOOLEAN,
        description: "Block outgoing messages with several personal-data signals unless you add [allow-pii].",
        default: true
    },
    personalSignalThreshold: {
        type: OptionType.NUMBER,
        description: "How many personal-data signals trigger a block.",
        default: 2
    }
});

const PATTERNS = [
    { type: "email", severity: "personal" as const, re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
    { type: "phone-like", severity: "personal" as const, re: /(?:\+?\d[\d\s().-]{7,}\d)/g },
    { type: "street-address-like", severity: "personal" as const, re: /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|platz|strasse|straße|weg|gasse)\b/gi },
    { type: "postal-code-like", severity: "personal" as const, re: /\b(?:\d{5}(?:-\d{4})?|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/gi },
    { type: "discord-token-shaped", severity: "high" as const, re: /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g },
    { type: "private-key-block", severity: "high" as const, re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { type: "seed-phrase-language", severity: "high" as const, re: /\b(?:seed phrase|recovery phrase|private key|wallet words)\b/gi },
    { type: "payment-card-like", severity: "high" as const, re: /\b(?:\d[ -]*?){13,19}\b/g }
];

function analyze(content: string) {
    const findings: Finding[] = [];

    for (const pattern of PATTERNS) {
        pattern.re.lastIndex = 0;
        const matches = content.match(pattern.re);
        if (!matches?.length) continue;
        findings.push({
            type: pattern.type,
            severity: pattern.severity,
            count: matches.length
        });
    }

    return findings;
}

function personalSignalCount(findings: Finding[]) {
    return findings
        .filter(finding => finding.severity === "personal")
        .reduce((sum, finding) => sum + finding.count, 0);
}

function hasHighRisk(findings: Finding[]) {
    return findings.some(finding => finding.severity === "high");
}

function formatFindings(findings: Finding[]) {
    return findings
        .map(finding => `- ${finding.type}: ${finding.count} (${finding.severity})`)
        .join("\n") || "- no sensitive patterns";
}

function maybeBlock(channelId: string, content: string) {
    const findings = analyze(content);
    if (!findings.length) return false;

    const blockHigh = settings.store.blockHighRiskSecrets && hasHighRisk(findings);
    const blockPersonal = settings.store.blockPersonalDataBursts && personalSignalCount(findings) >= settings.store.personalSignalThreshold;
    if (!blockHigh && !blockPersonal) return false;

    sendBotMessage(channelId, {
        content: [
            "**CustomerPrivacyGuard blocked this outgoing message.**",
            "It looks like it contains sensitive customer or account data. Store private details in SecureSupportVault or add `[allow-pii]` once if this send is intentional.",
            "",
            formatFindings(findings)
        ].join("\n").slice(0, 1900)
    });

    return true;
}

export default definePlugin({
    name: "CustomerPrivacyGuard",
    description: "Blocks accidental leaks of customer addresses, contact details, payment-like data, private keys, or token-shaped secrets.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Privacy", "Utility", "Chat"],
    enabledByDefault: true,
    dependencies: ["CommandsAPI"],
    settings,

    onBeforeMessageSend(channelId, msg) {
        if (msg.content.includes("[allow-pii]")) {
            msg.content = msg.content.replace(/\s*\[allow-pii\]\s*/g, " ").trim();
            return;
        }

        if (maybeBlock(channelId, msg.content)) return { cancel: true };
    },

    onBeforeMessageEdit(channelId, _messageId, msg) {
        if (msg.content.includes("[allow-pii]")) {
            msg.content = msg.content.replace(/\s*\[allow-pii\]\s*/g, " ").trim();
            return;
        }

        if (maybeBlock(channelId, msg.content)) return { cancel: true };
    },

    commands: [{
        name: "privacy-check",
        description: "Locally check text for sensitive customer/account data patterns",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [{
            name: "text",
            description: "Text to scan locally",
            type: ApplicationCommandOptionType.STRING,
            required: true
        }],
        execute: (opts, ctx) => {
            const text = String(findOption(opts, "text", ""));
            sendBotMessage(ctx.channel.id, {
                content: `**CustomerPrivacyGuard scan**\n${formatFindings(analyze(text))}`
            });
        }
    }]
});
