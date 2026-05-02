/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Settings } from "@api/Settings";
import { addSupportGuild, classifySupportChannel, clearDoneTickets, clearIgnoredTickets, clearOutOfScopeTickets, createSupportTrackerOptions, DEFAULT_SUPPORT_CONFIG, formatDue, formatRelativeTime, getActionableTickets, getConfiguredGuilds, getCurrentChannelSource, getTicketStats, ignoreTicket, loadSupportConfig, loadSupportState, markDone, markNeedsReply, openSupportTicket, PreferredSupportLanguage, QueueState, removeSupportGuild, setPreferredLanguage, setTrackDms, snoozeTicket, SupportDeskConfig, SupportTrackerOptions, TicketRecord, ticketScope, trainSupportChannel } from "@api/SupportDesk";
import { Button } from "@components/Button";
import { ClockIcon, CogWheel, DeleteIcon, NoEntrySignIcon, NotesIcon, ReplyIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { classNameFactory } from "@utils/css";
import { ChannelStore, React, SelectedChannelStore, showToast, Toasts, useEffect, useMemo, useState } from "@webpack/common";

import Plugins from "~plugins";

const cl = classNameFactory("vc-support-desk-");

const EMPTY_STATE: QueueState = { version: 1, tickets: {} };

function getTrackerOptions() {
    return createSupportTrackerOptions(Settings.plugins.SupportQueueGuard as Partial<SupportTrackerOptions> | undefined);
}

function currentChannelLabel(channelId: string | undefined) {
    if (!channelId) return "No channel selected";
    const channel = ChannelStore.getChannel(channelId);
    return channel?.name ? `#${channel.name}` : channelId;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" | "success"; }) {
    return (
        <div className={cl("stat", tone)}>
            <div className={cl("stat-value")}>{value}</div>
            <div className={cl("stat-label")}>{label}</div>
        </div>
    );
}

function ActionButton({ icon, children, ...props }: React.ComponentProps<typeof Button> & { icon: React.ReactNode; }) {
    return (
        <Button size="small" {...props}>
            <span className={cl("button-content")}>
                {icon}
                <span>{children}</span>
            </span>
        </Button>
    );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "danger" | "warning" | "success"; }) {
    return <span className={cl("pill", tone)}>{children}</span>;
}

function TicketCard({ ticket, refresh }: { ticket: TicketRecord; refresh(): Promise<void>; }) {
    const overdue = Boolean(ticket.dueAt && ticket.dueAt <= Date.now());
    const dueSoon = Boolean(ticket.dueAt && ticket.dueAt > Date.now() && ticket.dueAt <= Date.now() + 60 * 60 * 1000);

    async function run(label: string, action: () => Promise<unknown>) {
        await action();
        showToast(label, Toasts.Type.SUCCESS, { position: Toasts.Position.BOTTOM });
        await refresh();
    }

    return (
        <article className={cl("ticket", { overdue, "due-soon": dueSoon })}>
            <div className={cl("ticket-main")}>
                <div className={cl("ticket-header")}>
                    <button className={cl("ticket-title")} onClick={() => openSupportTicket(ticket.channelId)}>
                        {ticketScope(ticket)}
                    </button>
                    <span className={cl("due")}>{formatDue(ticket)}</span>
                </div>

                <div className={cl("ticket-meta")}>
                    <span>{ticket.reason}</span>
                    {ticket.unreadCount ? <span>{ticket.unreadCount} unread since last reply</span> : null}
                    <span>Activity {formatRelativeTime(ticket.lastActivityAt)}</span>
                    {ticket.language ? <span>{ticket.language}</span> : null}
                    {typeof ticket.classifierScore === "number" ? <span>score {ticket.classifierScore}</span> : null}
                </div>

                {ticket.classifierReasons?.length ? (
                    <div className={cl("reason-list")}>
                        {ticket.classifierReasons.slice(0, 3).map(reason => <Pill key={reason}>{reason}</Pill>)}
                    </div>
                ) : null}

                {ticket.lastSnippet && (
                    <blockquote className={cl("snippet")}>
                        {ticket.lastAuthorName ? `${ticket.lastAuthorName}: ` : ""}
                        {ticket.lastSnippet}
                    </blockquote>
                )}
            </div>

            <div className={cl("actions")}>
                <ActionButton icon={<ReplyIcon className={cl("button-icon")} />} onClick={() => openSupportTicket(ticket.channelId)}>
                    Open
                </ActionButton>
                <ActionButton icon={<ReplyIcon className={cl("button-icon")} />} variant="positive" onClick={() => run("Support conversation marked done.", () => markDone(ticket.channelId, getTrackerOptions(), "done in Support Desk"))}>
                    Done
                </ActionButton>
                <ActionButton icon={<ClockIcon className={cl("button-icon")} />} variant="secondary" onClick={() => run("Support conversation snoozed for 2 hours.", () => snoozeTicket(ticket.channelId, 2, getTrackerOptions()))}>
                    2h
                </ActionButton>
                <ActionButton icon={<ClockIcon className={cl("button-icon")} />} variant="secondary" onClick={() => run("Support conversation snoozed until tomorrow.", () => snoozeTicket(ticket.channelId, 24, getTrackerOptions()))}>
                    24h
                </ActionButton>
                <ActionButton icon={<NoEntrySignIcon className={cl("button-icon")} />} variant="dangerSecondary" onClick={() => run("Conversation ignored and trained as not support.", () => ignoreTicket(ticket.channelId, getTrackerOptions(), true))}>
                    Not support
                </ActionButton>
            </div>
        </article>
    );
}

function SupportDeskTab() {
    const [state, setState] = useState<QueueState>(EMPTY_STATE);
    const [config, setConfig] = useState<SupportDeskConfig>(DEFAULT_SUPPORT_CONFIG);
    const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>(SelectedChannelStore.getChannelId?.());
    const source = useMemo(() => getCurrentChannelSource(selectedChannelId), [selectedChannelId]);
    const configuredGuilds = useMemo(() => getConfiguredGuilds(config), [config]);
    const actionable = useMemo(() => getActionableTickets(state, Date.now(), config), [state, config]);
    const stats = useMemo(() => getTicketStats(state, Date.now(), config), [state, config]);
    const currentTicket = selectedChannelId ? state.tickets[selectedChannelId] : undefined;
    const currentClassification = useMemo(() =>
        selectedChannelId ? classifySupportChannel(selectedChannelId, {}, config, getTrackerOptions()) : undefined,
    [selectedChannelId, config]);

    async function refresh() {
        setSelectedChannelId(SelectedChannelStore.getChannelId?.());
        const [nextState, nextConfig] = await Promise.all([loadSupportState(), loadSupportConfig()]);
        setState(nextState);
        setConfig(nextConfig);
    }

    async function run(label: string, action: () => Promise<unknown>) {
        await action();
        showToast(label, Toasts.Type.SUCCESS, { position: Toasts.Position.BOTTOM });
        await refresh();
    }

    async function watchCurrent() {
        if (!selectedChannelId) return;
        if (!source.isDm && source.guildId) await addSupportGuild(source.guildId);
        await trainSupportChannel(selectedChannelId, true);
        await markNeedsReply(selectedChannelId, "manual watch", getTrackerOptions(), {}, undefined, true);
    }

    async function notSupportCurrent() {
        if (!selectedChannelId) return;
        await trainSupportChannel(selectedChannelId, false);
        await ignoreTicket(selectedChannelId, getTrackerOptions(), false);
    }

    async function updateLanguage(preferredLanguage: PreferredSupportLanguage) {
        await setPreferredLanguage(preferredLanguage);
        await clearOutOfScopeTickets();
    }

    useEffect(() => {
        void refresh();
        const timer = setInterval(() => void refresh(), 5000);
        return () => clearInterval(timer);
    }, []);

    return (
        <SettingsTab>
            <section className={cl("hero")}>
                <div>
                    <h2 className={cl("title")}>Support Desk</h2>
                    <Paragraph className={cl("intro")}>
                        Local support inbox for selected workspaces only. It classifies support conversations, filters non-English-script tickets when English-only is active, and reminds you until you reply, snooze, or ignore.
                    </Paragraph>
                </div>

                <div className={cl("top-actions")}>
                    <ActionButton icon={<CogWheel className={cl("button-icon")} />} variant="secondary" onClick={() => openPluginModal(Plugins.SupportQueueGuard, () => void 0)}>
                        Guard settings
                    </ActionButton>
                    <ActionButton icon={<ReplyIcon className={cl("button-icon")} />} onClick={() => void refresh()}>
                        Refresh
                    </ActionButton>
                </div>
            </section>

            <section className={cl("workspace")}>
                <div>
                    <div className={cl("eyebrow")}>Support sources</div>
                    <div className={cl("workspace-title")}>
                        {source.isDm
                            ? "Current source: Direct Messages"
                            : source.guildName
                                ? `Current server: ${source.guildName}`
                                : "Current source: no server selected"}
                    </div>
                    <div className={cl("workspace-note")}>
                        Guild channels are tracked only after you add the server as a support workspace. This stops random servers from polluting the queue.
                    </div>
                </div>

                <div className={cl("actions")}>
                    {!source.isDm && source.guildId && !config.trackedGuildIds.includes(source.guildId) && (
                        <ActionButton icon={<NotesIcon className={cl("button-icon")} />} onClick={() => run("Server added as support workspace.", () => addSupportGuild(source.guildId!))}>
                            Add server
                        </ActionButton>
                    )}
                    {!source.isDm && source.guildId && config.trackedGuildIds.includes(source.guildId) && (
                        <ActionButton icon={<DeleteIcon className={cl("button-icon")} />} variant="dangerSecondary" onClick={() => run("Server removed from support workspaces.", () => removeSupportGuild(source.guildId!))}>
                            Remove server
                        </ActionButton>
                    )}
                    <ActionButton icon={<ReplyIcon className={cl("button-icon")} />} variant={config.trackDms ? "positive" : "secondary"} onClick={() => run(config.trackDms ? "DM tracking disabled." : "DM tracking enabled.", () => setTrackDms(!config.trackDms))}>
                        DMs {config.trackDms ? "on" : "off"}
                    </ActionButton>
                    <ActionButton icon={<NotesIcon className={cl("button-icon")} />} variant={config.preferredLanguage === "english" ? "positive" : "secondary"} onClick={() => run("Language filter set to English only.", () => updateLanguage("english"))}>
                        English only
                    </ActionButton>
                    <ActionButton icon={<NotesIcon className={cl("button-icon")} />} variant={config.preferredLanguage === "all" ? "positive" : "secondary"} onClick={() => run("Language filter allows all languages.", () => updateLanguage("all"))}>
                        All languages
                    </ActionButton>
                    <ActionButton icon={<DeleteIcon className={cl("button-icon")} />} variant="dangerSecondary" onClick={() => run("Out-of-scope conversations cleared.", clearOutOfScopeTickets)}>
                        Clear random
                    </ActionButton>
                </div>

                <div className={cl("source-list")}>
                    {configuredGuilds.length
                        ? configuredGuilds.map(guild => <Pill key={guild.id} tone="success">{guild.name}</Pill>)
                        : <Pill tone="warning">No support servers selected yet</Pill>}
                    <Pill tone={config.preferredLanguage === "english" ? "success" : undefined}>
                        {config.preferredLanguage === "english" ? "English-only filter" : "All languages"}
                    </Pill>
                    <Pill tone={config.trackDms ? "success" : undefined}>
                        DMs {config.trackDms ? "tracked" : "ignored"}
                    </Pill>
                </div>
            </section>

            <section className={cl("stats")}>
                <Stat label="Need reply" value={stats.actionable} />
                <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? "danger" : undefined} />
                <Stat label="Due soon" value={stats.dueSoon} tone={stats.dueSoon ? "warning" : undefined} />
                <Stat label="Snoozed" value={stats.snoozed} />
                <Stat label="Done" value={stats.done} tone="success" />
            </section>

            <section className={cl("current")}>
                <div>
                    <div className={cl("eyebrow")}>Current conversation</div>
                    <div className={cl("current-title")}>{currentChannelLabel(selectedChannelId)}</div>
                    <div className={cl("current-note")}>
                        {currentTicket
                            ? `${currentTicket.status} - ${formatDue(currentTicket)}`
                            : currentClassification
                                ? `${currentClassification.isSupport ? "Classifier would track this" : "Classifier will ignore this"} - score ${currentClassification.score}/${currentClassification.threshold} - ${currentClassification.reasons.slice(0, 2).join(", ")}`
                                : "No current classifier signal."}
                    </div>
                </div>

                <div className={cl("actions")}>
                    <ActionButton
                        icon={<ClockIcon className={cl("button-icon")} />}
                        disabled={!selectedChannelId}
                        onClick={() => selectedChannelId && run("Current conversation added and trained as support.", watchCurrent)}
                    >
                        Watch
                    </ActionButton>
                    <ActionButton
                        icon={<ReplyIcon className={cl("button-icon")} />}
                        variant="positive"
                        disabled={!selectedChannelId}
                        onClick={() => selectedChannelId && run("Current conversation marked done.", () => markDone(selectedChannelId, getTrackerOptions(), "done in Support Desk"))}
                    >
                        Done
                    </ActionButton>
                    <ActionButton
                        icon={<ClockIcon className={cl("button-icon")} />}
                        variant="secondary"
                        disabled={!selectedChannelId}
                        onClick={() => selectedChannelId && run("Current conversation snoozed for 2 hours.", () => snoozeTicket(selectedChannelId, 2, getTrackerOptions()))}
                    >
                        Snooze
                    </ActionButton>
                    <ActionButton
                        icon={<NoEntrySignIcon className={cl("button-icon")} />}
                        variant="dangerSecondary"
                        disabled={!selectedChannelId}
                        onClick={() => selectedChannelId && run("Current conversation trained as not support.", notSupportCurrent)}
                    >
                        Not support
                    </ActionButton>
                </div>
            </section>

            <section className={cl("list")}>
                <div className={cl("section-header")}>
                    <h3 className={cl("section-title")}>Needs Reply</h3>
                    <div className={cl("cleanup")}>
                        <ActionButton icon={<DeleteIcon className={cl("button-icon")} />} variant="secondary" onClick={() => run("Done conversations cleared.", clearDoneTickets)}>
                            Clear done
                        </ActionButton>
                        <ActionButton icon={<DeleteIcon className={cl("button-icon")} />} variant="dangerSecondary" onClick={() => run("Ignored conversations cleared.", clearIgnoredTickets)}>
                            Clear ignored
                        </ActionButton>
                    </div>
                </div>

                {actionable.length
                    ? actionable.map(ticket => <TicketCard key={ticket.channelId} ticket={ticket} refresh={refresh} />)
                    : (
                        <div className={cl("empty")}>
                            <div className={cl("empty-title")}>Nothing is waiting on you.</div>
                            <Paragraph>Add the server you support, keep English-only on, and the classifier will only surface conversations that look like support work.</Paragraph>
                        </div>
                    )}
            </section>
        </SettingsTab>
    );
}

export default wrapTab(SupportDeskTab, "Support Desk");
