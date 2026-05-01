/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";

const dsLog = new Logger("TranslatorPro/DeepSeek");

const tpNative: PluginNative<typeof import("./native")> | null = IS_DISCORD_DESKTOP
    ? (VencordNative.pluginHelpers.TranslatorPro as PluginNative<typeof import("./native")>)
    : null;

/** Abort after this many ms so the UI does not hang forever if the API or network stalls. */
const DEEPSEEK_FETCH_MS = 90_000;

function deepSeekFetchSignal(): AbortSignal {
    const c = new AbortController();
    setTimeout(() => c.abort(), DEEPSEEK_FETCH_MS);
    return c.signal;
}

export const LANGS: Record<string, string> = {
    auto: "Auto-Detect", af: "Afrikaans", am: "Amharic", ar: "Arabic", az: "Azerbaijani",
    be: "Belarusian", bg: "Bulgarian", bn: "Bengali", bs: "Bosnian", ca: "Catalan",
    cs: "Czech", cy: "Welsh", da: "Danish", de: "German", el: "Greek", en: "English",
    es: "Spanish", et: "Estonian", fa: "Persian", fi: "Finnish", fr: "French",
    ga: "Irish", gl: "Galician", gu: "Gujarati", ha: "Hausa", hi: "Hindi", hr: "Croatian",
    hu: "Hungarian", hy: "Armenian", id: "Indonesian", is: "Icelandic", it: "Italian",
    ja: "Japanese", ka: "Georgian", kk: "Kazakh", km: "Khmer", kn: "Kannada", ko: "Korean",
    ku: "Kurdish", la: "Latin", lt: "Lithuanian", lv: "Latvian", mk: "Macedonian",
    ml: "Malayalam", mn: "Mongolian", mr: "Marathi", ms: "Malay", mt: "Maltese",
    my: "Myanmar", ne: "Nepali", nl: "Dutch", no: "Norwegian", pa: "Punjabi", pl: "Polish",
    ps: "Pashto", pt: "Portuguese", ro: "Romanian", ru: "Russian", sk: "Slovak",
    sl: "Slovenian", sq: "Albanian", sr: "Serbian", sv: "Swedish", sw: "Swahili",
    ta: "Tamil", te: "Telugu", th: "Thai", tl: "Filipino", tr: "Turkish", uk: "Ukrainian",
    ur: "Urdu", uz: "Uzbek", vi: "Vietnamese", yi: "Yiddish",
    "zh-CN": "Chinese (Simplified)", "zh-TW": "Chinese (Traditional)", zu: "Zulu"
};

async function googleTranslate(text: string, from: string, to: string) {
    const p = new URLSearchParams({
        "params.client": "gtx",
        "dataTypes": "TRANSLATION",
        "key": "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA",
        "query.sourceLanguage": from,
        "query.targetLanguage": to,
        "query.text": text,
    });
    const r = await fetch("https://translate-pa.googleapis.com/v1/translate?" + p);
    if (!r.ok) throw new Error("Google error " + r.status);
    const b = await r.json();
    return {
        text: b.translation || "",
        detected: b.sourceLanguage as string | undefined
    };
}

async function deeplTranslate(text: string, from: string, to: string, key: string, paid: boolean) {
    if (!key?.trim()) throw new Error("DeepL API key missing (set in TranslatorPro → right-click Heino icon, or Vencord plugin settings)");
    const url = paid ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate";
    const body: any = { text: [text], target_lang: to.toUpperCase() };
    if (from && from !== "auto") body.source_lang = from.toUpperCase();
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "DeepL-Auth-Key " + key }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error("DeepL error " + r.status);
    const b = await r.json();
    return { text: (b.translations || []).map((t: any) => t?.text).filter(Boolean).join(""), detected: b.translations?.[0]?.detected_source_language?.toLowerCase() as string | undefined };
}

async function readDeepSeekApiError(r: Response): Promise<string> {
    const raw = await r.text();
    return parseDeepSeekErrorText(raw, r.statusText || String(r.status));
}

function parseDeepSeekErrorText(raw: string, fallback: string): string {
    try {
        const b = JSON.parse(raw);
        const msg = b?.error?.message ?? b?.message;
        if (typeof msg === "string" && msg.length) return msg;
    } catch {
        /* not JSON */
    }
    if (raw.length && raw.length < 500) return raw;
    return fallback;
}

/** Chat completions: desktop uses main-process fetch (CORS-safe). */
async function deepSeekChatCompletionJson(apiKey: string, body: object): Promise<any> {
    const k = apiKey?.trim();
    if (!k) throw new Error("DeepSeek API key missing (TranslatorPro modal or settings)");

    const payload = JSON.stringify(body);

    if (tpNative) {
        dsLog.info("DeepSeek POST via native (main process)");
        const { status, data } = await tpNative.deepSeekChatCompletion(k, payload);
        if (status === -1)
            throw new Error(`DeepSeek network error: ${data}`);
        if (status < 200 || status >= 300)
            throw new Error(`DeepSeek HTTP ${status}: ${parseDeepSeekErrorText(data, String(status))}`);
        return JSON.parse(data);
    }

    dsLog.info("DeepSeek POST via renderer fetch (Web / no native — may hit CORS)");
    let r: Response;
    try {
        r = await fetch("https://api.deepseek.com/v1/chat/completions", {
            method: "POST",
            signal: deepSeekFetchSignal(),
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + k },
            body: payload,
        });
    } catch (e: any) {
        if (e?.name === "AbortError")
            throw new Error(`DeepSeek: timeout after ${DEEPSEEK_FETCH_MS / 1000}s (no response). Check firewall/VPN or api.deepseek.com reachability.`);
        dsLog.error("fetch failed", e);
        throw new Error(`DeepSeek network error: ${e?.message ?? String(e)}`);
    }
    if (!r.ok) throw new Error(`DeepSeek HTTP ${r.status}: ${await readDeepSeekApiError(r)}`);
    return r.json();
}

async function deepseekTranslate(text: string, to: string, key: string) {
    const outName = LANGS[to] || to;
    dsLog.info(`chat/completions (translate) → ${outName}, ${text.length} chars`);
    const b = await deepSeekChatCompletionJson(key, {
        model: "deepseek-chat",
        messages: [{ role: "user", content: `Translate to ${outName}. Return ONLY the translation:\n${text}` }],
        temperature: 0.2
    });
    const out = b.choices?.[0]?.message?.content?.trim() || "";
    if (!out) {
        dsLog.warn("empty choices/content", b);
        throw new Error("DeepSeek returned empty text (check API key, quota, or model availability).");
    }
    dsLog.info(`DeepSeek OK, ${out.length} chars out`);
    return { text: out, detected: undefined as string | undefined };
}

/** Default system prompt when „Stil-Stimme“ custom prompt is empty (English instructions for the model). */
export const DEFAULT_STYLE_VOICE_PROMPT = `You rewrite short chat messages to match this voice:
- Very informal, like casual tech or gaming support in Discord
- Short sentences; direct, blunt, friendly “we’ll sort it out” energy
- Plain wording; if the input is English, a slight non-native / ESL texture is OK; otherwise keep the input language
- No corporate or marketing tone; do not add facts, links, or promises the user did not imply
- Output only the rewritten message text, no quotes or preamble`;

async function deepseekStyleVoice(text: string, key: string, systemPrompt: string) {
    const sys = (systemPrompt || "").trim() || DEFAULT_STYLE_VOICE_PROMPT;
    dsLog.info(`chat/completions (Stil-Stimme), ${text.length} chars, system ${sys.length} chars`);
    const b = await deepSeekChatCompletionJson(key, {
        model: "deepseek-chat",
        messages: [
            { role: "system", content: sys },
            {
                role: "user",
                content: `Rewrite the following message in that voice. Keep the same language as the input. Do not add information. Output ONLY the rewritten text:\n\n${text}`
            }
        ],
        temperature: 0.65
    });
    const out = b.choices?.[0]?.message?.content?.trim() || "";
    if (!out) {
        dsLog.warn("empty choices/content (style)", b);
        throw new Error("DeepSeek (Stil-Stimme) returned empty text.");
    }
    dsLog.info(`DeepSeek (Stil-Stimme) OK, ${out.length} chars`);
    return { text: out, detected: undefined as string | undefined };
}

export async function callEngine(engine: string, text: string, from: string, to: string, store: any): Promise<{ text: string; detected?: string; }> {
    switch (engine) {
        case "googleapi": return googleTranslate(text, from, to);
        case "deepl": return deeplTranslate(text, from, to, store.deepLKey || "", store.deepLPaid);
        case "deepseek": return deepseekTranslate(text, to, store.deepSeekKey || "");
        case "stylevoice": return deepseekStyleVoice(text, store.deepSeekKey || "", store.styleVoicePrompt || "");
        default: return googleTranslate(text, from, to);
    }
}
