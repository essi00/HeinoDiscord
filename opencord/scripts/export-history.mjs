#!/usr/bin/env node
/*
 * HeinoDiscord full history exporter.
 * Uses a Discord bot token from HEINODISCORD_EXPORT_BOT_TOKEN.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createWriteStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";

const API = "https://discord.com/api/v10";
const TEXT_CHANNEL_TYPES = new Set([0, 2, 5, 10, 11, 12]);
const THREAD_PARENT_TYPES = new Set([0, 5, 15, 16]);

function parseArgs(argv) {
    const args = {};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("--")) continue;

        const key = arg.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith("--")) {
            args[key] = true;
        } else {
            args[key] = next;
            i++;
        }
    }

    return args;
}

function usage(exitCode = 1) {
    console.log(`
HeinoDiscord full history exporter

Usage:
  pnpm heino:export-history -- --guild-id <guild_id> [options]

Required environment:
  HEINODISCORD_EXPORT_BOT_TOKEN    Discord bot token. Never use a user token.

Options:
  --guild-id <id>                  Guild/server to export.
  --out <dir>                      Output directory. Default: exports/discord-history/<guild>-<time>
  --channel-id <id,id>             Optional comma-separated channel/thread allowlist.
  --max-messages <n>               Optional per-channel message cap for test runs.
  --no-threads                     Skip active and archived threads.
  --include-private-archives       Try private archived thread endpoints too.
  --help                           Show this help.

Notes:
  The bot must be invited to the server and have View Channel plus Read Message
  History in each exported channel. Message content may be empty unless the bot
  has the Message Content privileged intent enabled in the Discord Developer Portal.
`);
    process.exit(exitCode);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeName(name) {
    return String(name || "channel")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 90);
}

function toCsvSet(value) {
    if (!value) return null;
    return new Set(String(value).split(",").map(s => s.trim()).filter(Boolean));
}

class DiscordApiError extends Error {
    constructor(message, status, path, body) {
        super(message);
        this.status = status;
        this.path = path;
        this.body = body;
    }
}

const args = parseArgs(process.argv.slice(2));
if (args.help) usage(0);

const guildId = args["guild-id"];
const botToken = process.env.HEINODISCORD_EXPORT_BOT_TOKEN;
const includeThreads = !args["no-threads"];
const includePrivateArchives = !!args["include-private-archives"];
const channelAllowlist = toCsvSet(args["channel-id"]);
const maxMessages = args["max-messages"] ? Number(args["max-messages"]) : Infinity;
const outputRoot = resolve(args.out || join("exports", "discord-history", `${guildId || "guild"}-${stamp()}`));

if (!guildId || !botToken) usage();
if (!Number.isFinite(maxMessages) && args["max-messages"]) {
    throw new Error("--max-messages must be a number");
}

async function request(path, options = {}) {
    const url = path.startsWith("http") ? path : `${API}${path}`;

    for (;;) {
        const response = await fetch(url, {
            headers: {
                Authorization: `Bot ${botToken}`,
                "User-Agent": "HeinoDiscordHistoryExporter (https://github.com/essi00/HeinoDiscord)"
            }
        });

        const text = await response.text();
        const data = text ? JSON.parse(text) : null;

        if (response.status === 429) {
            const retryAfter = Number(response.headers.get("retry-after") || data?.retry_after || 1);
            await sleep(Math.ceil(retryAfter * 1000) + 250);
            continue;
        }

        if (response.status === 403 || response.status === 404) {
            if (options.allowMissing) {
                return {
                    ok: false,
                    status: response.status,
                    data
                };
            }
        }

        if (!response.ok) {
            throw new DiscordApiError(`Discord API ${response.status} for ${path}`, response.status, path, data);
        }

        const remaining = response.headers.get("x-ratelimit-remaining");
        const resetAfter = Number(response.headers.get("x-ratelimit-reset-after") || 0);
        if (remaining === "0" && resetAfter > 0) {
            await sleep(Math.ceil(resetAfter * 1000) + 250);
        }

        return data;
    }
}

function summarizeChannel(channel, kind = "channel") {
    return {
        id: channel.id,
        parentId: channel.parent_id,
        guildId: channel.guild_id || guildId,
        name: channel.name,
        type: channel.type,
        kind,
        nsfw: channel.nsfw ?? false,
        archived: channel.thread_metadata?.archived ?? false,
        archiveTimestamp: channel.thread_metadata?.archive_timestamp
    };
}

function normalizeMessage(message) {
    return {
        id: message.id,
        channelId: message.channel_id,
        guildId,
        type: message.type,
        timestamp: message.timestamp,
        editedTimestamp: message.edited_timestamp,
        pinned: message.pinned,
        author: message.author ? {
            id: message.author.id,
            username: message.author.username,
            globalName: message.author.global_name,
            bot: message.author.bot ?? false
        } : null,
        content: message.content ?? "",
        attachments: (message.attachments || []).map(attachment => ({
            id: attachment.id,
            filename: attachment.filename,
            url: attachment.url,
            proxyUrl: attachment.proxy_url,
            size: attachment.size,
            contentType: attachment.content_type
        })),
        embeds: (message.embeds || []).map(embed => ({
            title: embed.title,
            description: embed.description,
            url: embed.url,
            type: embed.type
        })),
        reactions: (message.reactions || []).map(reaction => ({
            count: reaction.count,
            emoji: reaction.emoji ? {
                id: reaction.emoji.id,
                name: reaction.emoji.name
            } : null
        })),
        mentions: (message.mentions || []).map(user => ({
            id: user.id,
            username: user.username,
            globalName: user.global_name
        })),
        mentionRoleIds: message.mention_roles || [],
        referencedMessageId: message.message_reference?.message_id,
        referencedChannelId: message.message_reference?.channel_id,
        referencedGuildId: message.message_reference?.guild_id
    };
}

async function listArchivedThreads(parent, routeName) {
    const threads = [];
    let before = "";

    for (;;) {
        const separator = before ? `&before=${encodeURIComponent(before)}` : "";
        const response = await request(`/channels/${parent.id}/${routeName}?limit=100${separator}`, { allowMissing: true });
        if (!response || response.ok === false) return threads;

        for (const thread of response.threads || []) {
            threads.push(thread);
        }

        if (!response.has_more || !response.threads?.length) return threads;

        const last = response.threads[response.threads.length - 1];
        before = last.thread_metadata?.archive_timestamp || last.id;
    }
}

async function collectExportTargets(channels) {
    const targets = new Map();

    for (const channel of channels) {
        if (TEXT_CHANNEL_TYPES.has(channel.type)) {
            targets.set(channel.id, summarizeChannel(channel));
        }
    }

    if (!includeThreads) return [...targets.values()];

    const active = await request(`/guilds/${guildId}/threads/active`, { allowMissing: true });
    if (active?.threads) {
        for (const thread of active.threads) {
            targets.set(thread.id, summarizeChannel(thread, "active-thread"));
        }
    }

    for (const parent of channels.filter(channel => THREAD_PARENT_TYPES.has(channel.type))) {
        for (const thread of await listArchivedThreads(parent, "threads/archived/public")) {
            targets.set(thread.id, summarizeChannel(thread, "public-archived-thread"));
        }

        if (includePrivateArchives) {
            for (const thread of await listArchivedThreads(parent, "threads/archived/private")) {
                targets.set(thread.id, summarizeChannel(thread, "private-archived-thread"));
            }
            for (const thread of await listArchivedThreads(parent, "users/@me/threads/archived/private")) {
                targets.set(thread.id, summarizeChannel(thread, "joined-private-archived-thread"));
            }
        }
    }

    return [...targets.values()];
}

async function exportMessages(target, channelsDir) {
    const fileName = `${safeName(target.name)}-${target.id}.jsonl`;
    const filePath = join(channelsDir, fileName);
    const stream = createWriteStream(filePath, { encoding: "utf8" });
    let before = "";
    let count = 0;
    let pages = 0;

    try {
        for (;;) {
            const beforeParam = before ? `&before=${before}` : "";
            const page = await request(`/channels/${target.id}/messages?limit=100${beforeParam}`, { allowMissing: true });

            if (page?.ok === false) {
                return {
                    ...target,
                    file: fileName,
                    messageCount: count,
                    pages,
                    skipped: true,
                    skipStatus: page.status
                };
            }

            if (!Array.isArray(page) || page.length === 0) break;

            for (const message of page) {
                if (count >= maxMessages) break;
                stream.write(`${JSON.stringify(normalizeMessage(message))}\n`);
                count++;
            }

            pages++;
            before = page[page.length - 1].id;
            if (page.length < 100 || count >= maxMessages) break;
        }
    } finally {
        await new Promise(resolve => stream.end(resolve));
    }

    return {
        ...target,
        file: fileName,
        messageCount: count,
        pages,
        skipped: false
    };
}

async function main() {
    await mkdir(outputRoot, { recursive: true });
    const channelsDir = join(outputRoot, "channels");
    await mkdir(channelsDir, { recursive: true });

    const bot = await request("/users/@me");
    const guild = await request(`/guilds/${guildId}`);
    const channels = await request(`/guilds/${guildId}/channels`);
    const targets = (await collectExportTargets(channels))
        .filter(target => !channelAllowlist || channelAllowlist.has(target.id));

    const summary = {
        exporter: "HeinoDiscord Full History Exporter",
        exportedAt: new Date().toISOString(),
        guild: {
            id: guild.id,
            name: guild.name
        },
        bot: {
            id: bot.id,
            username: bot.username
        },
        format: "jsonl-newest-to-oldest-per-channel",
        includeThreads,
        includePrivateArchives,
        maxMessages: Number.isFinite(maxMessages) ? maxMessages : null,
        outputRoot,
        channels: []
    };

    console.log(`[export] Guild: ${guild.name} (${guild.id})`);
    console.log(`[export] Targets: ${targets.length}`);

    for (const target of targets) {
        process.stdout.write(`[export] ${target.kind}: #${target.name || target.id} ... `);
        const result = await exportMessages(target, channelsDir);
        summary.channels.push(result);
        console.log(result.skipped ? `skipped (${result.skipStatus})` : `${result.messageCount} messages`);
    }

    await writeFile(join(outputRoot, "archive-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`[export] Done: ${outputRoot}`);
}

main().catch(error => {
    if (error instanceof DiscordApiError) {
        console.error(`[export] ${error.message}`);
        if (error.status === 401) {
            console.error("[export] Invalid bot token. Use HEINODISCORD_EXPORT_BOT_TOKEN with a bot token only.");
        }
        if (error.body) {
            console.error(JSON.stringify(error.body, null, 2));
        }
        process.exit(1);
    }

    console.error(error);
    process.exit(1);
});
