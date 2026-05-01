/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { ChannelStore, Constants, Menu, RestAPI, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    replacementText: {
        type: OptionType.STRING,
        description: "Text to replace the message with before deletion.",
        default: "** **"
    },
    deleteDelay: {
        type: OptionType.NUMBER,
        description: "Delay in milliseconds before deleting the replacement message (recommended: 100-500).",
        default: 200
    },
    suppressNotifications: {
        type: OptionType.BOOLEAN,
        description: "Suppress notifications when replacing the message (prevents pinging mentioned users).",
        default: true
    },
    deleteOriginal: {
        type: OptionType.BOOLEAN,
        description: "Delete the original message from server. If disabled, the original message will reappear on client restart.",
        default: true
    },
    purgeInterval: {
        type: OptionType.NUMBER,
        description: "Delay in milliseconds between each message deletion during /silentpurge (recommended: 500-1000 to avoid rate limits).",
        default: 500
    },
    accentColor: {
        type: OptionType.STRING,
        description: "Accent color for the Silent Delete icon (hex code).",
        default: "#ed4245"
    }
});

const getAccentColor = () => settings.store.accentColor || "#ed4245";

const SilentDeleteIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg width={width} height={height} className={className} viewBox="0 0 24 24" aria-hidden>
        <path fill={getAccentColor()} d="M3 6h18v2H3V6Zm2 3h14v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Zm3.5 2v9h1v-9h-1Zm4 0v9h1v-9h-1ZM9 3h6v1H9V3Z" />
    </svg>
);

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function silentDeleteMessage(channelId: string, messageId: string, deleteOriginal = true): Promise<boolean> {
    try {
        const {
            replacementText = "** **",
            deleteDelay = 200,
            suppressNotifications = true,
            deleteOriginal: shouldDelete = true
        } = settings.store;

        const { body } = await RestAPI.post({
            url: Constants.Endpoints.MESSAGES(channelId),
            body: {
                content: replacementText,
                flags: suppressNotifications ? 4096 : 0,
                mobile_network_type: "unknown",
                nonce: messageId,
                tts: false
            }
        });

        await sleep(deleteDelay);
        await RestAPI.del({ url: Constants.Endpoints.MESSAGE(channelId, body.id) });

        if (deleteOriginal && shouldDelete) {
            await sleep(100);
            await RestAPI.del({ url: Constants.Endpoints.MESSAGE(channelId, messageId) });
        }

        return true;
    } catch (error) {
        console.error("[SilentDelete] Error:", error);
        return false;
    }
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, { message }) => {
    const currentUser = UserStore.getCurrentUser();
    if (!message || message.author.id !== currentUser.id) return;

    if (message.deleted) {
        const group = findGroupChildrenByChildId("remove-message-history", children) ?? children;
        group.push(
            <Menu.MenuItem
                id="vc-silent-delete-history"
                key="vc-silent-delete-history"
                label="Silent Delete History"
                color="danger"
                icon={SilentDeleteIcon}
                action={() => void silentDeleteMessage(message.channel_id, message.id, false)}
            />
        );
        return;
    }

    const menuGroup = findGroupChildrenByChildId("delete", children);
    const deleteIndex = menuGroup?.findIndex(i => i?.props?.id === "delete");
    if (menuGroup == null || deleteIndex == null || deleteIndex < 0) return;

    menuGroup.splice(deleteIndex, 0, (
        <Menu.MenuItem
            id="vc-silent-delete"
            key="vc-silent-delete"
            label="Silent Delete"
            color="danger"
            icon={SilentDeleteIcon}
            action={() => void silentDeleteMessage(message.channel_id, message.id)}
        />
    ));
};

export default definePlugin({
    name: "SilentDelete",
    description: "\"Silently\" deletes a message. Bypasses message loggers by replacing the message with a placeholder (nonce exploit).",
    authors: [
        { name: "Aurick", id: 1348025017233047634n },
        { name: "appleflyer", id: 1209096766075703368n }
    ],
    dependencies: ["MessagePopoverAPI", "CommandsAPI"],
    settings,

    contextMenus: {
        "message": messageContextMenuPatch
    },

    messagePopoverButton: {
        icon: SilentDeleteIcon,
        render: msg => {
            if (msg.author.id !== UserStore.getCurrentUser().id || msg.deleted) return null;

            return {
                label: "Silent Delete",
                icon: SilentDeleteIcon,
                message: msg,
                channel: ChannelStore.getChannel(msg.channel_id),
                onClick: () => void silentDeleteMessage(msg.channel_id, msg.id),
                dangerous: true
            };
        }
    },

    commands: [
        {
            name: "silentpurge",
            description: "Silently delete your recent messages in this channel",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [{
                name: "count",
                description: "Number of your messages to silently delete (1-100)",
                type: ApplicationCommandOptionType.INTEGER,
                required: true
            }],
            execute: (opts, ctx) => {
                const count = Math.min(100, Math.max(1, findOption(opts, "count", 1) as number));
                if (!count || count < 1) return;

                const channelId = ctx.channel.id;
                const currentUserId = UserStore.getCurrentUser().id;

                (async () => {
                    try {
                        const userMessages: { id: string; author?: { id: string; }; }[] = [];
                        let lastMessageId: string | undefined;

                        while (userMessages.length < count) {
                            const { body: messages } = await RestAPI.get({
                                url: Constants.Endpoints.MESSAGES(channelId),
                                query: { limit: 100, ...(lastMessageId && { before: lastMessageId }) }
                            });

                            if (!messages?.length) break;

                            for (const msg of messages) {
                                if (msg.author?.id === currentUserId) {
                                    userMessages.push(msg);
                                    if (userMessages.length >= count) break;
                                }
                            }

                            lastMessageId = messages[messages.length - 1].id;
                            if (messages.length < 100) break;
                            await sleep(100);
                        }

                        if (!userMessages.length) return;

                        const purgeInterval = settings.store.purgeInterval || 500;
                        let successCount = 0;

                        for (let i = 0; i < userMessages.length; i++) {
                            if (await silentDeleteMessage(channelId, userMessages[i].id)) successCount++;
                            if (i < userMessages.length - 1) await sleep(purgeInterval);
                        }

                        sendBotMessage(channelId, { content: `Successfully silently deleted ${successCount} message(s).` });
                    } catch (error) {
                        console.error("[SilentDelete] Error during silent purge:", error);
                    }
                })();
            }
        }
    ]
});
