/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { showNotice } from "@api/Notices";
import { isPluginEnabled, pluginRequiresRestart, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { Settings } from "@api/Settings";
import { CogWheel, InfoIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { AddonCard } from "@components/settings/AddonCard";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { ChangeList } from "@utils/ChangeList";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { isObjectEmpty } from "@utils/misc";
import { useCleanupEffect } from "@utils/react";
import { Plugin } from "@utils/types";
import { Alerts, React, showToast, Toasts, useRef } from "@webpack/common";

import Plugins from "~plugins";

import { HEINO_LIBRARY_PLUGINS } from "./library";

const cl = classNameFactory("vc-heino-library-");
const logger = new Logger("HeinoPluginLibrary", "#5dd4c6");

function HeinoPluginCard({ plugin, commands, category, onRestartNeeded }: {
    plugin: Plugin;
    commands: string[];
    category: string;
    onRestartNeeded(name: string, key: string): void;
}) {
    const settings = Settings.plugins[plugin.name];
    const isEnabled = () => isPluginEnabled(plugin.name);

    function toggleEnabled() {
        const wasEnabled = isEnabled();

        if (!wasEnabled) {
            const { restartNeeded, failures } = startDependenciesRecursive(plugin);

            if (failures.length) {
                logger.error(`Failed to start dependencies for ${plugin.name}: ${failures.join(", ")}`);
                showNotice("Failed to start dependencies: " + failures.join(", "), "Close", () => null);
                return;
            }

            if (restartNeeded) {
                settings.enabled = true;
                onRestartNeeded(plugin.name, "enabled");
                return;
            }
        }

        if (pluginRequiresRestart(plugin)) {
            settings.enabled = !wasEnabled;
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        if (wasEnabled && !plugin.started) {
            settings.enabled = !wasEnabled;
            return;
        }

        const result = wasEnabled ? stopPlugin(plugin) : startPlugin(plugin);

        if (!result) {
            settings.enabled = false;
            showToast(`Error while ${wasEnabled ? "stopping" : "starting"} plugin ${plugin.name}`, Toasts.Type.FAILURE, {
                position: Toasts.Position.BOTTOM
            });
            return;
        }

        settings.enabled = !wasEnabled;
    }

    return (
        <AddonCard
            name={plugin.name}
            description={plugin.description}
            enabled={isEnabled()}
            setEnabled={toggleEnabled}
            author={category}
            infoButton={
                <button
                    role="switch"
                    onClick={() => openPluginModal(plugin, onRestartNeeded)}
                    className={cl("info-button")}
                >
                    {plugin.options && !isObjectEmpty(plugin.options)
                        ? <CogWheel className={cl("info-icon")} />
                        : <InfoIcon className={cl("info-icon")} />
                    }
                </button>
            }
            footer={
                <div className={cl("footer")}>
                    <div className={cl("meta")}>Commands</div>
                    <div className={cl("command-list")}>
                        {commands.map(command => (
                            <code key={command} className={cl("command")}>{command}</code>
                        ))}
                    </div>
                </div>
            }
        />
    );
}

function HeinoPluginLibraryTab() {
    const changeRef = useRef<ChangeList<string>>(null);
    const changes = changeRef.current ??= new ChangeList<string>();
    const installedLibraryPlugins = HEINO_LIBRARY_PLUGINS
        .map(info => ({ info, plugin: Plugins[info.name] }))
        .filter(({ plugin }) => Boolean(plugin));

    useCleanupEffect(() => {
        if (!changes.hasChanges) return;

        Alerts.show({
            title: "Restart required",
            body: "One or more HeinoDiscord plugins need a restart before the change is fully applied.",
            confirmText: "Restart now",
            cancelText: "Later",
            onConfirm: () => location.reload()
        });
    }, []);

    return (
        <SettingsTab>
            <Paragraph className={cl("intro", Margins.bottom16)}>
                HeinoDiscord Open Plugin Library contains the local-first plugins shipped by this distribution. They are separated from the compatibility plugin list so users can manage the product plugins directly.
            </Paragraph>

            <div className={cl("grid")}>
                {installedLibraryPlugins.length
                    ? installedLibraryPlugins.map(({ info, plugin }) => (
                        <HeinoPluginCard
                            key={info.name}
                            plugin={plugin}
                            category={info.category}
                            commands={info.commands}
                            onRestartNeeded={(name, key) => changes.handleChange(`${name}.${key}`)}
                        />
                    ))
                    : <Paragraph>No HeinoDiscord library plugins are installed in this build.</Paragraph>
                }
            </div>
        </SettingsTab>
    );
}

export default wrapTab(HeinoPluginLibraryTab, "Heino Plugins");
