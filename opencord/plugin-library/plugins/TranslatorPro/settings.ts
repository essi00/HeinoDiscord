/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { React } from "@webpack/common";

import { TranslatorProSettingsPanel } from "./TranslatorProSettingsPanel";

export const settings = definePluginSettings({
    /** Shown in Vencord → Plugins → TranslatorPro (full UI). Other keys are hidden but persist. */
    settingsPanel: {
        type: OptionType.COMPONENT,
        description: "TranslatorPro configuration",
        component: () => React.createElement(TranslatorProSettingsPanel),
    },
    engine: {
        type: OptionType.SELECT,
        description: "Translation engine",
        hidden: true,
        options: [
            { label: "Google Translate", value: "googleapi", default: true },
            { label: "DeepL", value: "deepl" },
            { label: "DeepSeek", value: "deepseek" },
            { label: "Stil-Stimme (DeepSeek)", value: "stylevoice" },
        ]
    },
    backupEngine: {
        type: OptionType.SELECT,
        description: "Backup engine (fallback when primary fails)",
        hidden: true,
        options: [
            { label: "None", value: "none", default: true },
            { label: "Google Translate", value: "googleapi" },
            { label: "DeepL", value: "deepl" },
            { label: "DeepSeek", value: "deepseek" },
            { label: "Stil-Stimme (DeepSeek)", value: "stylevoice" },
        ]
    },
    receivedInput: {
        type: OptionType.STRING,
        description: "Input language for received messages",
        default: "auto",
        hidden: true
    },
    receivedOutput: {
        type: OptionType.STRING,
        description: "Output language for received messages",
        default: "en",
        hidden: true
    },
    sentInput: {
        type: OptionType.STRING,
        description: "Input language for sent messages",
        default: "auto",
        hidden: true
    },
    sentOutput: {
        type: OptionType.STRING,
        description: "Output language for sent messages",
        default: "en",
        hidden: true
    },
    autoTranslate: {
        type: OptionType.BOOLEAN,
        description: "Automatically translate messages before sending",
        default: false,
        hidden: true,
    },
    sendOriginal: {
        type: OptionType.BOOLEAN,
        description: "Also send original message when auto-translating",
        default: true,
        hidden: true,
    },
    showOriginal: {
        type: OptionType.BOOLEAN,
        description: "Also show original when translating received messages",
        default: true,
        hidden: true,
    },
    useSpoiler: {
        type: OptionType.BOOLEAN,
        description: "Use spoiler tags instead of quotes for original text",
        default: false,
        hidden: true,
    },
    deepLKey: {
        type: OptionType.STRING,
        description: "DeepL API Key",
        default: "",
        hidden: true,
    },
    deepLPaid: {
        type: OptionType.BOOLEAN,
        description: "DeepL Pro (paid)",
        default: false,
        hidden: true,
    },
    deepSeekKey: {
        type: OptionType.STRING,
        description: "DeepSeek API Key",
        default: "",
        hidden: true,
    },
    /** System prompt for engine „stylevoice“. Empty = built-in default (informal support-chat style). */
    styleVoicePrompt: {
        type: OptionType.STRING,
        description: "Stil-Stimme: system prompt for DeepSeek",
        default: "",
        hidden: true,
    },
});
