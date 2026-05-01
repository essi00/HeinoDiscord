/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface HeinoLibraryPlugin {
    name: string;
    category: string;
    commands: string[];
}

export const HEINO_LIBRARY_PLUGINS = [
    {
        name: "QuickTemplates",
        category: "Productivity",
        commands: ["/qt", ";;hello"]
    },
    {
        name: "LinkSafety",
        category: "Privacy",
        commands: ["pre-send link guard"]
    },
    {
        name: "TranslatorPro",
        category: "Translation",
        commands: ["message translate actions", "auto-translate settings"]
    },
    {
        name: "LocalChatExporter",
        category: "Archive",
        commands: ["/export-local-chat", "/export-local-chat autoload:true seconds:120"]
    },
    {
        name: "ChatStats",
        category: "Local Insight",
        commands: ["/chat-stats"]
    },
    {
        name: "LocalSearch",
        category: "Productivity",
        commands: ["/local-search query:<text>"]
    },
    {
        name: "LinkCollector",
        category: "Archive",
        commands: ["/collect-links format:csv"]
    },
    {
        name: "AttachmentIndex",
        category: "Archive",
        commands: ["/attachment-index format:json"]
    },
    {
        name: "PrivacyScan",
        category: "Privacy",
        commands: ["/privacy-scan", "/privacy-scan export:true format:markdown"]
    },
    {
        name: "LastSeenTracker",
        category: "Advanced Local Insight",
        commands: ["local observed presence history"]
    }
] satisfies HeinoLibraryPlugin[];

export const HEINO_LIBRARY_PLUGIN_NAME_SET = new Set(HEINO_LIBRARY_PLUGINS.map(plugin => plugin.name));
