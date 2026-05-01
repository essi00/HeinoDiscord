/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { CommandContext, Message } from "@vencord/discord-types";
import { ChannelStore, Menu, showToast, Toasts } from "@webpack/common";

import { HeinoChatBarIcon, HeinoIcon, setShouldShowTooltip } from "./HeinoIcon";
import { settings } from "./settings";
import { callEngine, LANGS } from "./translate";
import { handleTranslate, TranslationAccessory } from "./TranslationAccessory";

const logger = new Logger("TranslatorPro");

let tooltipTimeout: ReturnType<typeof setTimeout> | undefined;

function getMessageContent(message: Message) {
    return message.content
        || message.messageSnapshots?.[0]?.message.content
        || message.embeds?.find(e => e.type === "auto_moderation_message")?.rawDescription
        || "";
}

async function translateText(text: string, kind: "received" | "sent") {
    const from = kind === "received" ? (settings.store.receivedInput || "auto") : (settings.store.sentInput || "auto");
    const to = kind === "received" ? (settings.store.receivedOutput || "en") : (settings.store.sentOutput || "en");
    const engine = settings.store.engine || "googleapi";
    const backup = settings.store.backupEngine || "none";

    try {
        const r = await callEngine(engine, text, from, to, settings.store);
        if (r.text) {
            return {
                text: r.text,
                sourceLanguage: r.detected ? (LANGS[r.detected] || r.detected) : (LANGS[from] || from),
            };
        }
    } catch (e) {
        if (backup && backup !== "none" && backup !== engine) {
            logger.warn("Primary engine failed, trying backup", e);
            try {
                const r = await callEngine(backup, text, from, to, settings.store);
                if (r.text) {
                    return {
                        text: r.text,
                        sourceLanguage: r.detected ? (LANGS[r.detected] || r.detected) : (LANGS[from] || from),
                    };
                }
            } catch (e2) {
                logger.error("Backup also failed", e2);
            }
        }
        throw e;
    }
    throw new Error(`No translation result (engine: ${engine}). If using DeepSeek, check key and Engine setting.`);
}

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    const content = getMessageContent(message);
    if (!content) return;

    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    group.splice(group.findIndex((c: any) => c?.props?.id === "copy-text") + 1, 0,
        <Menu.MenuItem
            id="vc-tp-translate"
            label="Translate (Pro)"
            icon={HeinoIcon}
            action={async () => {
                try {
                    const trans = await translateText(content, "received");
                    handleTranslate(message.id, {
                        text: trans.text,
                        sourceLanguage: trans.sourceLanguage,
                        original: settings.store.showOriginal ? content : undefined,
                    });
                } catch (e: any) {
                    showToast("Translation failed: " + (e?.message || "Unknown error"), Toasts.Type.FAILURE);
                }
            }}
        />
    );
};

export default definePlugin({
    name: "TranslatorPro",
    description: "Extended translator: Google (same API as Translate), DeepL, DeepSeek, optional „Stil-Stimme“ rewrite (DeepSeek + custom prompt), backup engine, auto-translate, /tp. Coexists with the built-in Translate plugin.",
    authors: [Devs.Ven],
    tags: ["translate", "translation", "translator", "TranslatorPro", "deepl", "deepseek", "google", "Heino"],
    settings,

    contextMenus: {
        "message": messageCtxPatch
    },

    renderMessageAccessory: props =>
        props.message ? <TranslationAccessory message={props.message as Message} /> : null,

    chatBarButton: {
        icon: HeinoIcon,
        render: HeinoChatBarIcon
    },

    messagePopoverButton: {
        icon: HeinoIcon,
        render(message: Message) {
            const content = getMessageContent(message);
            if (!content) return null;
            return {
                label: "Translate (Pro)",
                icon: HeinoIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: async () => {
                    try {
                        const trans = await translateText(content, "received");
                        handleTranslate(message.id, {
                            text: trans.text,
                            sourceLanguage: trans.sourceLanguage,
                            original: settings.store.showOriginal ? content : undefined,
                        });
                    } catch (e: any) {
                        showToast("Translation failed: " + (e?.message || "Unknown error"), Toasts.Type.FAILURE);
                    }
                }
            };
        }
    },

    async onBeforeMessageSend(_cid: string, message: { content: string; }) {
        if (!settings.store.autoTranslate) return;
        if (!message.content) return;

        setShouldShowTooltip?.(true);
        if (tooltipTimeout) clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => setShouldShowTooltip?.(false), 2000);

        try {
            const trans = await translateText(message.content, "sent");
            const original = message.content;
            message.content = trans.text;

            if (settings.store.sendOriginal) {
                message.content += settings.store.useSpoiler
                    ? `\n\n||${original}||`
                    : "\n\n> *" + original.split("\n").join("*\n> *") + "*";
            }
        } catch (e: any) {
            logger.error("Auto-translate failed:", e);
            const msg = e?.message ?? String(e);
            showToast(`TranslatorPro (Auto): ${msg}`, Toasts.Type.FAILURE);
        }
    },

    commands: [
        {
            name: "tp",
            description: "TranslatorPro: translate text (uses your engine & sent-output language)",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "text",
                    description: "Text to translate",
                    type: ApplicationCommandOptionType.STRING,
                    required: true,
                },
                {
                    name: "to",
                    description: "Target language code (e.g. en, de, ja)",
                    type: ApplicationCommandOptionType.STRING,
                    required: false,
                },
            ],
            execute: async (args, ctx: CommandContext) => {
                const text = findOption<string>(args, "text");
                const to = findOption<string>(args, "to") ?? settings.store.sentOutput ?? "en";
                if (!text?.trim()) return;

                try {
                    const r = await callEngine(settings.store.engine || "googleapi", text, "auto", to, settings.store);
                    if (r.text) {
                        sendBotMessage(ctx.channel.id, { content: r.text });
                    } else {
                        sendBotMessage(ctx.channel.id, { content: "Translation failed: empty result (check Engine = DeepSeek/Stil-Stimme and API key)." });
                    }
                } catch (e: any) {
                    sendBotMessage(ctx.channel.id, {
                        content: "Translation failed: " + (e?.message ?? String(e)),
                    });
                }
            },
        },
    ],

    start() {
        logger.info("TranslatorPro started");
    },
    stop() {
        logger.info("TranslatorPro stopped");
    },
});
