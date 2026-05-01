#!/usr/bin/env node
/*
 * Imports Discord's official account data package into readable DM archives.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { basename, extname, join, resolve } from "path";

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
HeinoDiscord Discord data package importer

Usage:
  pnpm heino:import-data-package -- --input <package.zip|package-folder> [options]

Options:
  --input <path>          Discord data package zip or extracted package folder.
  --out <dir>             Output directory. Default: exports/discord-data-package/<time>
  --format <type>         json, markdown, or both. Default: both.
  --all                   Include server channels too. Default imports only DMs/group DMs.
  --help                  Show this help.

Notes:
  This reads Discord's official account data package. It does not use tokens.
  Discord data packages contain messages you sent; they are not a full copy of
  every message other people sent to you.
`);
    process.exit(exitCode);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) usage(0);

const input = args.input ? resolve(args.input) : "";
const outputRoot = resolve(args.out || join("exports", "discord-data-package", new Date().toISOString().replace(/[:.]/g, "-")));
const format = args.format || "both";
const includeAll = !!args.all;

if (!input || !existsSync(input)) usage();
if (!["json", "markdown", "both"].includes(format)) {
    throw new Error("--format must be json, markdown, or both");
}

function safeName(name) {
    return String(name || "channel")
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 120) || "channel";
}

function splitCsvLine(line) {
    const cells = [];
    let cell = "";
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];

        if (quoted) {
            if (char === "\"" && next === "\"") {
                cell += "\"";
                i++;
            } else if (char === "\"") {
                quoted = false;
            } else {
                cell += char;
            }
            continue;
        }

        if (char === "\"") {
            quoted = true;
        } else if (char === ",") {
            cells.push(cell);
            cell = "";
        } else {
            cell += char;
        }
    }

    cells.push(cell);
    return cells;
}

function parseCsv(text) {
    const rows = [];
    let line = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === "\"" && quoted && next === "\"") {
            line += char + next;
            i++;
            continue;
        }

        if (char === "\"") quoted = !quoted;

        if ((char === "\n" || char === "\r") && !quoted) {
            if (char === "\r" && next === "\n") i++;
            rows.push(splitCsvLine(line));
            line = "";
        } else {
            line += char;
        }
    }

    if (line.length) rows.push(splitCsvLine(line));
    if (!rows.length) return [];

    const headers = rows.shift().map(h => h.trim());
    return rows
        .filter(row => row.some(cell => cell.length))
        .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function normalizeMessage(row) {
    return {
        id: row.ID || row.id || row["Message ID"] || "",
        timestamp: row.Timestamp || row.timestamp || "",
        content: row.Contents || row.Content || row.content || "",
        attachments: row.Attachments || row.attachments || ""
    };
}

function isDmChannel(folderName, indexName, channelJson) {
    const name = String(indexName || "").toLowerCase();
    if (name.includes("direct message") || name.includes("group")) return true;
    if (Array.isArray(channelJson?.recipients)) return true;
    if (channelJson?.type === 1 || channelJson?.type === 3) return true;
    if (folderName.toLowerCase().startsWith("c") && Array.isArray(channelJson?.recipients)) return true;
    return false;
}

function markdownFor(channel, messages) {
    const lines = [
        `# ${channel.displayName}`,
        "",
        `Channel ID: ${channel.channelId}`,
        `Imported at: ${new Date().toISOString()}`,
        `Messages in data package: ${messages.length}`,
        "",
        "> Discord account data packages include messages sent by the account owner. They are not a full transcript of every message from every participant.",
        ""
    ];

    for (const message of messages) {
        lines.push(`## ${message.timestamp || "unknown time"} - ${message.id || "unknown id"}`);
        lines.push("");
        lines.push(message.content || "_No text content_");
        if (message.attachments) {
            lines.push("");
            lines.push(`Attachments: ${message.attachments}`);
        }
        lines.push("");
    }

    return lines.join("\n");
}

function runPowerShellExtract(zipPath, destination) {
    const commands = [
        ["powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(destination)} -Force`]],
        ["pwsh.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(destination)} -Force`]]
    ];

    for (const [command, commandArgs] of commands) {
        const result = spawnSync(command, commandArgs, { stdio: "pipe", encoding: "utf8" });
        if (result.status === 0) return;
    }

    throw new Error("Could not extract zip. Extract the Discord data package manually and pass the folder with --input.");
}

async function findPackageRoot(root) {
    const candidates = [
        root,
        join(root, "package"),
        join(root, "Discord Data Package"),
        join(root, basename(root, extname(root)))
    ];

    for (const candidate of candidates) {
        if (existsSync(join(candidate, "messages", "index.json"))) return candidate;
    }

    const children = await readdir(root, { withFileTypes: true });
    for (const child of children.filter(c => c.isDirectory())) {
        const candidate = join(root, child.name);
        if (existsSync(join(candidate, "messages", "index.json"))) return candidate;
    }

    throw new Error("Could not find messages/index.json in the provided package.");
}

async function prepareInput() {
    if (extname(input).toLowerCase() !== ".zip") return input;

    const extractionRoot = join(outputRoot, "_extracted");
    await mkdir(extractionRoot, { recursive: true });
    runPowerShellExtract(input, extractionRoot);
    return extractionRoot;
}

async function readJsonIfExists(path) {
    if (!existsSync(path)) return null;
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
}

async function readJson(path) {
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
}

async function main() {
    await mkdir(outputRoot, { recursive: true });
    const preparedInput = await prepareInput();
    const packageRoot = await findPackageRoot(preparedInput);
    const messagesRoot = join(packageRoot, "messages");
    const index = await readJson(join(messagesRoot, "index.json"));
    const entries = await readdir(messagesRoot, { withFileTypes: true });

    const summary = {
        importer: "HeinoDiscord Discord Data Package Importer",
        importedAt: new Date().toISOString(),
        source: input,
        packageRoot,
        mode: includeAll ? "all-message-folders" : "dm-and-group-dm-folders",
        note: "Discord account data packages include messages sent by the account owner, not every message from every participant.",
        channels: []
    };

    const channelsOut = join(outputRoot, "channels");
    await mkdir(channelsOut, { recursive: true });

    for (const entry of entries.filter(e => e.isDirectory())) {
        const channelDir = join(messagesRoot, entry.name);
        const csvPath = join(channelDir, "messages.csv");
        if (!existsSync(csvPath)) continue;

        const channelJson = await readJsonIfExists(join(channelDir, "channel.json"));
        const indexName = index[entry.name] || index[channelJson?.id] || index[channelJson?.channel_id] || entry.name;
        const dm = isDmChannel(entry.name, indexName, channelJson);
        if (!includeAll && !dm) continue;

        const messages = parseCsv(await readFile(csvPath, "utf8")).map(normalizeMessage);
        const channelId = channelJson?.id || channelJson?.channel_id || entry.name.replace(/^c/i, "");
        const displayName = String(indexName || channelJson?.name || entry.name);
        const baseName = `${safeName(displayName)}-${channelId}`;

        if (format === "json" || format === "both") {
            await writeFile(join(channelsOut, `${baseName}.json`), `${JSON.stringify({
                channelId,
                displayName,
                isDm: dm,
                channel: channelJson,
                messageCount: messages.length,
                messages
            }, null, 2)}\n`);
        }

        if (format === "markdown" || format === "both") {
            await writeFile(join(channelsOut, `${baseName}.md`), markdownFor({ channelId, displayName }, messages));
        }

        summary.channels.push({
            folder: entry.name,
            channelId,
            displayName,
            isDm: dm,
            messageCount: messages.length
        });
    }

    await writeFile(join(outputRoot, "import-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

    console.log(`[import] Package: ${packageRoot}`);
    console.log(`[import] Channels: ${summary.channels.length}`);
    console.log(`[import] Messages: ${summary.channels.reduce((sum, channel) => sum + channel.messageCount, 0)}`);
    console.log(`[import] Output: ${outputRoot}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
