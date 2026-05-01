/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Margins } from "@utils/margins";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot } from "@utils/modal";
import { Forms } from "@webpack/common";

import { TranslatorProSettingsPanel } from "./TranslatorProSettingsPanel";

export function TranslatorProModal({ rootProps }: { rootProps: ModalProps; }) {
    return (
        <ModalRoot {...rootProps}>
            <ModalHeader className="vc-tp-modal-header">
                <Forms.FormTitle tag="h2" className="vc-tp-modal-title">
                    TranslatorPro
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent className={"vc-tp-modal-content " + Margins.bottom16}>
                <TranslatorProSettingsPanel />
            </ModalContent>
        </ModalRoot>
    );
}
