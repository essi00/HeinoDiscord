/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import * as DataStore from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

interface VaultItem {
    key: string;
    iv: string;
    ciphertext: string;
    createdAt: string;
    updatedAt: string;
}

interface VaultState {
    version: 1;
    salt: string;
    items: Record<string, VaultItem>;
}

const STORE_KEY = "HeinoSecureSupportVault:v1";
let sessionKey: CryptoKey | null = null;
let unlockedAt = 0;
let lastUsedAt = 0;
let lockTimer: ReturnType<typeof setInterval> | undefined;

const settings = definePluginSettings({
    autoLockMinutes: {
        type: OptionType.NUMBER,
        description: "Automatically forget the in-memory vault key after this many idle minutes.",
        default: 10
    },
    pbkdf2Iterations: {
        type: OptionType.NUMBER,
        description: "PBKDF2-SHA-256 iterations for deriving the local AES-GCM key.",
        default: 250000
    }
});

function randomBytes(length: number) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(value: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function getVault(): Promise<VaultState> {
    const existing = await DataStore.get<VaultState>(STORE_KEY);
    if (existing) return existing;

    const created: VaultState = {
        version: 1,
        salt: bytesToBase64(randomBytes(16)),
        items: {}
    };
    await DataStore.set(STORE_KEY, created);
    return created;
}

async function saveVault(vault: VaultState) {
    await DataStore.set(STORE_KEY, vault);
}

async function deriveKey(passphrase: string, salt: string) {
    const material = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(passphrase),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            hash: "SHA-256",
            salt: base64ToBytes(salt),
            iterations: Math.max(100000, Number(settings.store.pbkdf2Iterations) || 250000)
        },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

function requireUnlocked() {
    if (!sessionKey) throw new Error("Vault locked. Run /secure-vault action:unlock text:<passphrase> first.");
    lastUsedAt = Date.now();
    return sessionKey;
}

function lock() {
    sessionKey = null;
    unlockedAt = 0;
    lastUsedAt = 0;
}

async function unlock(passphrase: string) {
    const vault = await getVault();
    sessionKey = await deriveKey(passphrase, vault.salt);
    unlockedAt = Date.now();
    lastUsedAt = unlockedAt;
}

async function encryptText(plainText: string) {
    const key = requireUnlocked();
    const iv = randomBytes(12);
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(plainText)
    );

    return {
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(encrypted))
    };
}

async function decryptText(item: VaultItem) {
    const key = requireUnlocked();
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(item.iv) },
        key,
        base64ToBytes(item.ciphertext)
    );

    return new TextDecoder().decode(decrypted);
}

function safeFileName(name: string) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").slice(0, 80) || "secure-note";
}

function downloadFile(fileName: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function addNote(noteKey: string, text: string) {
    const vault = await getVault();
    const encrypted = await encryptText(text);
    const existing = vault.items[noteKey];
    const timestamp = new Date().toISOString();

    vault.items[noteKey] = {
        key: noteKey,
        ...encrypted,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp
    };

    await saveVault(vault);
}

async function readNote(noteKey: string) {
    const vault = await getVault();
    const item = vault.items[noteKey];
    if (!item) throw new Error(`No vault note named '${noteKey}'.`);
    return decryptText(item);
}

async function deleteNote(noteKey: string) {
    const vault = await getVault();
    delete vault.items[noteKey];
    await saveVault(vault);
}

async function listNotes() {
    const vault = await getVault();
    return Object.values(vault.items).sort((a, b) => a.key.localeCompare(b.key));
}

function statusText(count: number) {
    if (!sessionKey) return `SecureSupportVault is locked. Stored notes: ${count}.`;

    const idleMinutes = Math.round((Date.now() - lastUsedAt) / 60000);
    const unlockedMinutes = Math.round((Date.now() - unlockedAt) / 60000);
    return `SecureSupportVault is unlocked in memory. Stored notes: ${count}. Unlocked ${unlockedMinutes} minute(s), idle ${idleMinutes} minute(s).`;
}

function checkAutoLock() {
    if (!sessionKey) return;
    const maxIdleMs = Math.max(1, settings.store.autoLockMinutes) * 60 * 1000;
    if (Date.now() - lastUsedAt > maxIdleMs) lock();
}

export default definePlugin({
    name: "SecureSupportVault",
    description: "Local AES-GCM encrypted vault for support notes, draft snippets, order context, and sensitive customer details you do not want stored as plain text.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Privacy", "Utility"],
    enabledByDefault: true,
    dependencies: ["CommandsAPI"],
    settings,

    start() {
        lockTimer = setInterval(checkAutoLock, 30_000);
    },

    stop() {
        if (lockTimer) clearInterval(lockTimer);
        lockTimer = undefined;
        lock();
    },

    commands: [{
        name: "secure-vault",
        description: "Manage local encrypted support notes",
        inputType: ApplicationCommandInputType.BUILT_IN,
        options: [
            {
                name: "action",
                description: "unlock, lock, add, read, delete, list, status",
                type: ApplicationCommandOptionType.STRING,
                required: true
            },
            {
                name: "key",
                description: "Note key/name",
                type: ApplicationCommandOptionType.STRING,
                required: false
            },
            {
                name: "text",
                description: "Passphrase for unlock, or note text for add",
                type: ApplicationCommandOptionType.STRING,
                required: false
            },
            {
                name: "reveal",
                description: "Show decrypted note in local chat instead of downloading a local text file",
                type: ApplicationCommandOptionType.BOOLEAN,
                required: false
            }
        ],
        execute: async (opts, ctx) => {
            const action = String(findOption(opts, "action", "")).toLowerCase();
            const noteKey = String(findOption(opts, "key", "")).trim();
            const text = String(findOption(opts, "text", ""));
            const reveal = Boolean(findOption(opts, "reveal", false));

            try {
                if (action === "unlock") {
                    if (!text) throw new Error("Provide your passphrase in the text option.");
                    await unlock(text);
                    sendBotMessage(ctx.channel.id, {
                        content: "SecureSupportVault unlocked locally. The passphrase is not stored. Lock it with `/secure-vault action:lock`."
                    });
                    return;
                }

                if (action === "lock") {
                    lock();
                    sendBotMessage(ctx.channel.id, { content: "SecureSupportVault locked. In-memory key forgotten." });
                    return;
                }

                if (action === "add") {
                    if (!noteKey || !text) throw new Error("Use action:add with key and text.");
                    await addNote(noteKey, text);
                    sendBotMessage(ctx.channel.id, { content: `SecureSupportVault encrypted note '${noteKey}' locally.` });
                    return;
                }

                if (action === "read") {
                    if (!noteKey) throw new Error("Use action:read with key.");
                    const plainText = await readNote(noteKey);
                    if (reveal) {
                        sendBotMessage(ctx.channel.id, {
                            content: `**SecureSupportVault: ${noteKey}**\n${plainText}`.slice(0, 1900)
                        });
                    } else {
                        downloadFile(`${safeFileName(noteKey)}.txt`, plainText);
                        sendBotMessage(ctx.channel.id, { content: `SecureSupportVault decrypted '${noteKey}' to a local browser download.` });
                    }
                    return;
                }

                if (action === "delete") {
                    if (!noteKey) throw new Error("Use action:delete with key.");
                    await deleteNote(noteKey);
                    sendBotMessage(ctx.channel.id, { content: `SecureSupportVault deleted '${noteKey}'.` });
                    return;
                }

                if (action === "list") {
                    const notes = await listNotes();
                    sendBotMessage(ctx.channel.id, {
                        content: notes.length
                            ? `**SecureSupportVault notes**\n${notes.map(note => `- ${note.key} (updated ${note.updatedAt})`).join("\n")}`.slice(0, 1900)
                            : "SecureSupportVault has no stored notes."
                    });
                    return;
                }

                if (action === "status") {
                    const notes = await listNotes();
                    sendBotMessage(ctx.channel.id, { content: statusText(notes.length) });
                    return;
                }

                throw new Error("Unknown action. Use unlock, lock, add, read, delete, list, or status.");
            } catch (error) {
                sendBotMessage(ctx.channel.id, {
                    content: `SecureSupportVault: ${error instanceof Error ? error.message : String(error)}`
                });
            }
        }
    }]
});
