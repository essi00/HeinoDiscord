/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { Margins } from "@utils/margins";
import { Forms, SearchableSelect, Select, TextArea, TextInput, useMemo } from "@webpack/common";

import { settings } from "./settings";
import { DEFAULT_STYLE_VOICE_PROMPT, LANGS } from "./translate";

const LangKeys = ["receivedInput", "receivedOutput", "sentInput", "sentOutput"] as const;

const LangLabels: Record<string, string> = {
    receivedInput: "Input language (received messages):",
    receivedOutput: "Output language (received messages):",
    sentInput: "Input language (your messages):",
    sentOutput: "Output language (your messages):",
};

function LanguageSelect({ settingsKey, includeAuto }: { settingsKey: typeof LangKeys[number]; includeAuto: boolean; }) {
    const currentValue = settings.use([settingsKey])[settingsKey];

    const options = useMemo(() => {
        const opts = Object.entries(LANGS).map(([value, label]) => ({ value, label }));
        if (!includeAuto) return opts.filter(o => o.value !== "auto");
        return opts;
    }, []);

    return (
        <section className={Margins.bottom16}>
            <Forms.FormTitle tag="h3">{LangLabels[settingsKey]}</Forms.FormTitle>
            <SearchableSelect
                options={options}
                value={options.find(o => o.value === currentValue)?.value}
                placeholder="Select a language"
                maxVisibleItems={5}
                closeOnSelect={true}
                onChange={(v: string) => (settings.store as any)[settingsKey] = v}
            />
        </section>
    );
}

const EngineOptions = [
    { label: "Google", value: "googleapi" },
    { label: "DeepL", value: "deepl" },
    { label: "DeepSeek", value: "deepseek" },
    { label: "Stil-Stimme (DeepSeek)", value: "stylevoice" },
];

const BackupOptions = [
    { label: "None", value: "none" },
    ...EngineOptions,
];

/** Renders in Vencord → Plugins → TranslatorPro and in the Heino right-click modal */
export function TranslatorProSettingsPanel() {
    const s = settings.use([
        "engine", "backupEngine", "autoTranslate", "sendOriginal", "showOriginal", "useSpoiler",
        "deepLKey", "deepLPaid", "deepSeekKey", "styleVoicePrompt"
    ]);
    const {
        engine, backupEngine, autoTranslate, sendOriginal, showOriginal, useSpoiler,
        deepLKey, deepLPaid, deepSeekKey, styleVoicePrompt
    } = s;

    return (
        <div className="vc-tp-settings-panel">
            <Forms.FormText className={Margins.bottom16}>
                Configure TranslatorPro here (same view as right-click on the Heino chat button). Slash command: <code>/tp</code>
            </Forms.FormText>

            {LangKeys.map(k => (
                <LanguageSelect key={k} settingsKey={k} includeAuto={k.endsWith("Input")} />
            ))}

            <Divider className={Margins.bottom16} />

            <section className={Margins.bottom16}>
                <Forms.FormTitle tag="h3">API keys</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom8}>
                    Required for DeepL / DeepSeek. Google uses the built-in client key (same as Vencord Translate).
                </Forms.FormText>
                <Forms.FormTitle tag="h5" className={Margins.bottom8}>DeepL API key</Forms.FormTitle>
                <TextInput
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
                    value={deepLKey}
                    onChange={v => { settings.store.deepLKey = v; }}
                />
                <FormSwitch
                    className={Margins.top8}
                    title="DeepL Pro (api.deepl.com) — off = Free (api-free.deepl.com)"
                    value={deepLPaid}
                    onChange={(v: boolean) => settings.store.deepLPaid = v}
                    hideBorder
                />
                <Forms.FormTitle tag="h5" className={Margins.top16 + " " + Margins.bottom8}>DeepSeek API key</Forms.FormTitle>
                <TextInput
                    placeholder="sk-..."
                    value={deepSeekKey}
                    onChange={v => { settings.store.deepSeekKey = v; }}
                />
                <Forms.FormTitle tag="h5" className={Margins.top16 + " " + Margins.bottom8}>Stil-Stimme — System-Prompt (optional)</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom8}>
                    Nur für die Engine „Stil-Stimme“. Leer lassen = eingebauter Ton (informell, motivierend, kurze Sätze). Du kannst hier eigenen Ton beschreiben oder Beispiele einfügen, die du selbst schreibst.
                </Forms.FormText>
                <TextArea
                    placeholder={DEFAULT_STYLE_VOICE_PROMPT.slice(0, 120) + "…"}
                    value={styleVoicePrompt}
                    onChange={v => { settings.store.styleVoicePrompt = v; }}
                    rows={6}
                />
            </section>

            <Divider className={Margins.bottom16} />

            <section className={Margins.bottom16}>
                <Forms.FormTitle tag="h3">Engine</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom8}>
                    <strong>DeepSeek</strong> = nur Übersetzen in die Zielsprache („Output language“ oben). Der große Text <strong>Stil-Stimme — System-Prompt</strong> wird dabei <strong>nicht</strong> benutzt.
                    {" "}
                    <strong>Stil-Stimme</strong> = Umschreiben im gewünschten Ton (nutzt denselben DeepSeek-Key + den Prompt).
                </Forms.FormText>
                <Select
                    options={EngineOptions}
                    isSelected={v => v === engine}
                    select={(v: string) => settings.store.engine = v}
                    serialize={v => v}
                />
                {engine === "googleapi" && (
                    <Forms.FormText className={Margins.top8} style={{ color: "var(--status-warning)" }}>
                        Aktuell: <strong>Google</strong> — der DeepSeek-Key wird ignoriert. Für DeepSeek hier „DeepSeek“ oder „Stil-Stimme“ wählen.
                    </Forms.FormText>
                )}
                {(engine === "deepseek" || engine === "stylevoice") && !String(deepSeekKey || "").trim() && (
                    <Forms.FormText className={Margins.top8} style={{ color: "var(--status-warning)" }}>
                        Kein DeepSeek-Key eingetragen — Anfragen schlagen fehl, bis oben ein gültiger <code>sk-...</code> Key steht.
                    </Forms.FormText>
                )}
            </section>

            <section className={Margins.bottom16}>
                <Forms.FormTitle tag="h3">Backup engine</Forms.FormTitle>
                <Select
                    options={BackupOptions}
                    isSelected={v => v === backupEngine}
                    select={(v: string) => settings.store.backupEngine = v}
                    serialize={v => v}
                />
            </section>

            <Divider className={Margins.bottom16} />

            <FormSwitch
                title="Also append the original text when auto-translating your messages"
                value={sendOriginal}
                onChange={(v: boolean) => settings.store.sendOriginal = v}
                hideBorder
            />

            <FormSwitch
                title="Show original text under received translations"
                value={showOriginal}
                onChange={(v: boolean) => settings.store.showOriginal = v}
                hideBorder
            />

            <FormSwitch
                title="Use spoiler instead of quote block for appended original"
                value={useSpoiler}
                onChange={(v: boolean) => settings.store.useSpoiler = v}
                hideBorder
            />

            <Divider className={Margins.bottom16} />

            <FormSwitch
                title="Translate your messages before sending (Heino button toggles)"
                value={autoTranslate}
                onChange={(v: boolean) => settings.store.autoTranslate = v}
                hideBorder
            />
        </div>
    );
}
