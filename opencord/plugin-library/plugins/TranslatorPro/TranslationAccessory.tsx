/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Message } from "@vencord/discord-types";
import { Parser, useEffect, useState } from "@webpack/common";

export interface TranslationValue {
    text: string;
    sourceLanguage: string;
    /** Original message text when "show original" is enabled */
    original?: string;
}

const TranslationSetters = new Map<string, (v: TranslationValue | undefined) => void>();

export function handleTranslate(messageId: string, data: TranslationValue) {
    TranslationSetters.get(messageId)?.(data);
}

function Dismiss({ onDismiss }: { onDismiss: () => void; }) {
    return (
        <button
            type="button"
            className="vc-tp-dismiss"
            onClick={onDismiss}
        >
            dismiss
        </button>
    );
}

export function TranslationAccessory({ message }: { message: Message; }) {
    const [translation, setTranslation] = useState<TranslationValue | undefined>();

    useEffect(() => {
        if ((message as any).vencordEmbeddedBy) return;

        TranslationSetters.set(message.id, setTranslation);
        return () => void TranslationSetters.delete(message.id);
    }, [message.id]);

    if (!translation) return null;

    return (
        <span className="vc-tp-accessory">
            <span className="vc-tp-accessory-main">
                {Parser.parse(translation.text)}
            </span>
            <br />
            <span className="vc-tp-accessory-meta">
                (from {translation.sourceLanguage}
                {translation.original ? (
                    <>
                        {" · "}
                        <span className="vc-tp-original-preview">
                            original: {Parser.parse(translation.original)}
                        </span>
                    </>
                ) : null}
                {" · "}
                <Dismiss onDismiss={() => setTranslation(undefined)} />
                )
            </span>
        </span>
    );
}
