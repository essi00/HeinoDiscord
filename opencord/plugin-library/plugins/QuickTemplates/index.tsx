/*
 * Vencord UserPlugin
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, UserStore } from "@webpack/common";

type TemplateMap = Record<string, string>;

const DEFAULT_TEMPLATES: TemplateMap = {
    "hello": "Hey {user}, thanks for reaching out. I will check this for you now.",
    "need-info": "Can you send a screenshot, your order ID, and the exact error message?",
    "done": "Done. Please restart Discord and check again."
};

const settings = definePluginSettings({
    prefix: {
        type: OptionType.STRING,
        description: "Prefix used to expand templates before sending. Example: ;;hello",
        default: ";;"
    },
    templatesJson: {
        type: OptionType.STRING,
        description: "JSON object of templateName -> templateText. Variables: {user}, {username}, {channel}, {date}, {time}.",
        default: JSON.stringify(DEFAULT_TEMPLATES, null, 2)
    }
});

function getTemplates(): TemplateMap {
    try {
        const parsed = JSON.parse(settings.store.templatesJson || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULT_TEMPLATES;

        const clean: TemplateMap = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof key === "string" && typeof value === "string" && key.trim()) {
                clean[key.trim()] = value;
            }
        }
        return Object.keys(clean).length ? clean : DEFAULT_TEMPLATES;
    } catch {
        return DEFAULT_TEMPLATES;
    }
}

function renderTemplate(template: string, channelId?: string) {
    const user = UserStore.getCurrentUser();
    const channel = channelId ? ChannelStore.getChannel(channelId) : undefined;
    const now = new Date();

    return template
        .replaceAll("{user}", user ? `<@${user.id}>` : "")
        .replaceAll("{username}", user?.username ?? "")
        .replaceAll("{channel}", channel?.name ?? "")
        .replaceAll("{date}", now.toLocaleDateString())
        .replaceAll("{time}", now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
}

function expand(content: string, channelId?: string) {
    const prefix = settings.store.prefix || ";;";
    if (!content.startsWith(prefix)) return null;

    const [key, ...rest] = content.slice(prefix.length).trim().split(/\s+/);
    if (!key) return null;

    const templates = getTemplates();
    const template = templates[key];
    if (!template) return null;

    const rendered = renderTemplate(template, channelId);
    const suffix = rest.join(" ").trim();
    return suffix ? `${rendered}\n\n${suffix}` : rendered;
}

export default definePlugin({
    name: "QuickTemplates",
    description: "Expand local support/chat templates before sending, e.g. ;;hello. No network calls, no external storage.",
    authors: [{ name: "Open Plugin Library", id: 0n }],
    tags: ["Chat", "Utility"],
    settings,

    onBeforeMessageSend(channelId, msg) {
        const next = expand(msg.content, channelId);
        if (next) msg.content = next;
    },

    commands: [
        {
            name: "qt",
            description: "Preview a QuickTemplates entry locally",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{
                name: "name",
                description: "Template name, e.g. hello",
                type: ApplicationCommandOptionType.STRING,
                required: false
            }],
            execute: (opts, ctx) => {
                const templates = getTemplates();
                const name = findOption(opts, "name", "") as string;

                if (!name) {
                    sendBotMessage(ctx.channel.id, {
                        content: `Available templates: ${Object.keys(templates).map(k => `\`${k}\``).join(", ")}`
                    });
                    return;
                }

                const template = templates[name];
                sendBotMessage(ctx.channel.id, {
                    content: template
                        ? renderTemplate(template, ctx.channel.id)
                        : `Unknown template \`${name}\`. Available: ${Object.keys(templates).map(k => `\`${k}\``).join(", ")}`
                });
            }
        }
    ]
});
