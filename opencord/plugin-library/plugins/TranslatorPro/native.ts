/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const TIMEOUT_MS = 90_000;

/**
 * Runs in the Electron main process (no CORS). Discord’s renderer fetch() to api.deepseek.com fails with "Failed to fetch".
 */
export async function deepSeekChatCompletion(_: IpcMainInvokeEvent, apiKey: string, bodyJson: string) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(DEEPSEEK_URL, {
            method: "POST",
            signal: ac.signal,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: bodyJson,
        });
        const data = await res.text();
        return { status: res.status, data };
    } catch (e: unknown) {
        const err = e as { name?: string; message?: string; };
        if (err?.name === "AbortError") {
            return { status: -1, data: `timeout after ${TIMEOUT_MS / 1000}s` };
        }
        return { status: -1, data: String(e) };
    } finally {
        clearTimeout(timer);
    }
}
