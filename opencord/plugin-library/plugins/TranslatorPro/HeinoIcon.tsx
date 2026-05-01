/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { classes } from "@utils/misc";
import { openModal } from "@utils/modal";
import { IconComponent } from "@utils/types";
import { Tooltip, useEffect, useState } from "@webpack/common";

import { settings } from "./settings";
import { TranslatorProModal } from "./TranslatorProModal";

export const HeinoIcon: IconComponent = ({ height = 24, width = 24, className }) => (
    <svg viewBox="0 0 100 170" height={height} width={width} className={className} fill="currentColor">
        <path d="M38 58 L30 38 Q22 18 18 12 Q14 5 20 2 Q26 -1 30 6 L38 22 L42 38 L42 58 Z" />
        <path d="M46 58 L46 18 Q46 8 50 2 Q54 8 54 18 L54 58 Z" />
        <path d="M58 58 L62 38 L70 22 Q74 6 80 2 Q86 -1 82 6 Q78 12 70 22 L62 38 L62 58 Z" />
        <path d="M30 55 L70 55 L70 62 L30 62 Z" />
        <path d="M30 62 L42 62 L42 112 L30 112 Z" />
        <path d="M58 62 L70 62 L70 112 L58 112 Z" />
        <path d="M42 82 L58 82 L58 92 L42 92 Z" />
        <path d="M20 65 Q24 58 30 62 L30 78 Q24 75 20 70 Z" />
        <path d="M80 65 Q76 58 70 62 L70 78 Q76 75 80 70 Z" />
        <path d="M35 112 L42 112 L46 122 L46 138 L54 138 L54 122 L58 112 L65 112 Q58 125 55 130 L55 138 L45 138 L45 130 Q42 125 35 112 Z" />
        <path d="M50 138 L58 152 L50 168 L42 152 Z" />
    </svg>
);

export let setShouldShowTooltip: undefined | ((show: boolean) => void);

export const HeinoChatBarIcon: ChatBarButtonFactory = ({ isMainChat }) => {
    const { autoTranslate } = settings.use(["autoTranslate"]);
    const [showTooltip, setter] = useState(false);

    useEffect(() => {
        setShouldShowTooltip = setter;
        return () => { setShouldShowTooltip = undefined; };
    }, []);

    if (!isMainChat) return null;

    const toggle = () => {
        const newState = !settings.store.autoTranslate;
        settings.store.autoTranslate = newState;
        setter(true);
        setTimeout(() => setter(false), 2000);
    };

    const button = (
        <ChatBarButton
            tooltip={autoTranslate ? "TranslatorPro: ON (click to disable)" : "TranslatorPro: OFF (click to enable)"}
            onClick={toggle}
            onContextMenu={() => {
                openModal(props => <TranslatorProModal rootProps={props} />);
            }}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <HeinoIcon
                className={classes(
                    "vc-tp-heino-icon",
                    autoTranslate ? "vc-tp-auto-translate" : "",
                    "vc-tp-chat-button"
                )}
            />
        </ChatBarButton>
    );

    if (showTooltip)
        return (
            <Tooltip text={autoTranslate ? "Auto-Translate ON" : "Auto-Translate OFF"} forceOpen>
                {() => button}
            </Tooltip>
        );

    return button;
};
