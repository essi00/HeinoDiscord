/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    blockPunycode: {
        type: OptionType.BOOLEAN,
        description: "Block links with punycode domains, often used for lookalike phishing domains.",
        default: true
    },
    blockDiscordLookalikes: {
        type: OptionType.BOOLEAN,
        description: "Block suspicious Discord/Nitro lookalike domains before sending.",
        default: true
    },
    blockRawIpLinks: {
        type: OptionType.BOOLEAN,
        description: "Block direct IP address links.",
        default: false
    }
});

const URL_RE = /\bhttps?:\/\/[^\s<>()"]+/gi;
const DISCORD_ALLOWLIST = new Set([
    "discord.com",
    "discord.gg",
    "discordapp.com",
    "cdn.discordapp.com",
    "media.discordapp.net",
    "canary.discord.com",
    "ptb.discord.com"
]);

const DISCORD_WORDS = /discord|nitro|steam|gift|giveaway/i;
const RAW_IP = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function stripHost(hostname: string) {
    return hostname.toLowerCase().replace(/\.$/, "");
}

function looksLikeDiscordPhish(hostname: string) {
    if (DISCORD_ALLOWLIST.has(hostname)) return false;
    if ([...DISCORD_ALLOWLIST].some(allowed => hostname.endsWith(`.${allowed}`))) return false;
    return DISCORD_WORDS.test(hostname);
}

function findProblem(content: string) {
    const urls = content.match(URL_RE) ?? [];

    for (const rawUrl of urls) {
        let url: URL;
        try {
            url = new URL(rawUrl);
        } catch {
            continue;
        }

        const host = stripHost(url.hostname);

        if (settings.store.blockPunycode && host.includes("xn--")) {
            return `Blocked suspicious punycode domain: \`${host}\``;
        }

        if (settings.store.blockRawIpLinks && RAW_IP.test(host)) {
            return `Blocked direct IP address link: \`${host}\``;
        }

        if (settings.store.blockDiscordLookalikes && looksLikeDiscordPhish(host)) {
            return `Blocked Discord/Nitro lookalike domain: \`${host}\``;
        }
    }

    return null;
}

export default definePlugin({
    name: "LinkSafety",
    description: "Locally blocks obviously suspicious links before they are sent. No external lookups.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Privacy", "Utility"],
    enabledByDefault: true,
    settings,

    onBeforeMessageSend(channelId, msg) {
        const problem = findProblem(msg.content);
        if (!problem) return;

        sendBotMessage(channelId, {
            content: `${problem}\nMessage was not sent. Disable LinkSafety or edit the link if this was intentional.`
        });

        return { cancel: true };
    }
});
