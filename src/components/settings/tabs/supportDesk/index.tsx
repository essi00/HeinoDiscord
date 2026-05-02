/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 OpenCord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { Settings } from "@api/Settings";
import { clearDoneTickets, clearIgnoredTickets, createSupportTrackerOptions, formatDue, formatRelativeTime, getActionableTickets, getTicketStats, ignoreTicket, loadSupportState, markDone, markNeedsReply, openSupportTicket, QueueState, snoozeTicket, SupportTrackerOptions, TicketRecord, ticketScope } from "@api/SupportDesk";
import { Button } from "@components/Button";
import { ClockIcon, CogWheel, DeleteIcon, NoEntrySignIcon, ReplyIcon } from "@components/Icons";
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
                </div>

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
                <ActionButton icon={<NoEntrySignIcon className={cl("button-icon")} />} variant="dangerSecondary" onClick={() => run("Support conversation ignored locally.", () => ignoreTicket(ticket.channelId, getTrackerOptions()))}>
                    Ignore
                </ActionButton>
            </div>
        </article>
    );
}

function SupportDeskTab() {
    const [state, setState] = useState<QueueState>(EMPTY_STATE);
    const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>(SelectedChannelStore.getChannelId?.());
    const actionable = useMemo(() => getActionableTickets(state), [state]);
    const stats = useMemo(() => getTicketStats(state), [state]);
    const currentTicket = selectedChannelId ? state.tickets[selectedChannelId] : undefined;

    async function refresh() {
        setSelectedChannelId(SelectedChannelStore.getChannelId?.());
        setState(await loadSupportState());
    }

    async function run(label: string, action: () => Promise<unknown>) {
        await action();
        showToast(label, Toasts.Type.SUCCESS, { position: Toasts.Position.BOTTOM });
        await refresh();
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
                        Automatic local inbox for DMs and ticket channels you open or receive messages in. Conversations stay here until you reply, snooze, ignore, or mark them done.
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
                            : "Not tracked yet. Add it when you know you need to answer later."}
                    </div>
                </div>

                <div className={cl("actions")}>
                    <ActionButton
                        icon={<ClockIcon className={cl("button-icon")} />}
                        disabled={!selectedChannelId}
                        onClick={() => selectedChannelId && run("Current conversation added to Support Desk.", () => markNeedsReply(selectedChannelId, "manual watch", getTrackerOptions(), {}, undefined, true))}
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
                            <Paragraph>When you open a support DM or ticket channel and do not answer, it will appear here automatically.</Paragraph>
                        </div>
                    )}
            </section>
        </SettingsTab>
    );
}

export default wrapTab(SupportDeskTab, "Support Desk");
