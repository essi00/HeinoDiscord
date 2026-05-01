/*
 * Vencord, a modification for Discord's desktop app
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * LastSeenTracker — UserPlugin
 * Tracks when users go offline, shows "Last seen: …" in the member list
 * and user popout/profile, displays mutual servers, and detects invisible users.
 *
 * Two timestamps are tracked per user:
 *   lastSeenByUserId  — exact moment of an observed online→offline transition
 *   lastOnlineByUserId — continuously updated while the user is online/idle/dnd,
 *                        used as fallback when the offline transition was missed
 */

import "./style.css";

import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { addMessageDecoration, removeMessageDecoration } from "@api/MessageDecorations";
import { get as dsGet, set as dsSet } from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { OptionType } from "@utils/types";
import { findComponentByCodeLazy, findCssClassesLazy } from "@webpack";
import {
    ChannelStore,
    FluxDispatcher,
    GuildMemberStore,
    GuildStore,
    moment,
    PresenceStore,
    RelationshipStore,
    Text,
    Tooltip,
    useEffect,
    useMemo,
    useReducer,
    useState,
    UserProfileStore,
    UserStore,
    useStateFromStores
} from "@webpack/common";

// ---- Storage Keys ----
const SEEN_KEY = "LastSeenTracker_lastSeenByUserId_v1";
const ONLINE_KEY = "LastSeenTracker_lastOnlineByUserId_v1";
const INVISIBLE_KEY = "LastSeenTracker_invisibleDetections_v1";

// ---- In-memory state ----
/** Exact offline-transition timestamp (set only when we witness online→offline). */
const lastSeenByUserId: Record<string, number> = {};
/** Continuously updated while user is online/idle/dnd — fallback for missed transitions. */
const lastOnlineByUserId: Record<string, number> = {};
const lastKnownStatus = new Map<string, string>();

interface InvisibleDetection {
    userId: string;
    timestamp: number;
    channelId: string;
    guildId: string | null;
}

const invisibleDetections: InvisibleDetection[] = [];
const uiListeners = new Set<() => void>();

// ---- Lazy Webpack resolution ----
const WrapperClasses = findCssClassesLazy("memberSinceWrapper");
const ContainerClasses = findCssClassesLazy("memberSince");
const Section = findComponentByCodeLazy("headingVariant:", '"section"', "headingIcon:");

// ---- Settings ----
const settings = definePluginSettings({
    showInMemberList: {
        type: OptionType.BOOLEAN,
        description: "Show \"Last seen\" next to offline users in the member list",
        default: true,
        restartNeeded: true
    },
    showInPopout: {
        type: OptionType.BOOLEAN,
        description: "Show \"Last seen\" in user popout and profile",
        default: true,
        restartNeeded: false
    },
    showMutualServers: {
        type: OptionType.BOOLEAN,
        description: "Show mutual servers list in user popout/profile",
        default: true,
        restartNeeded: false
    },
    detectInvisible: {
        type: OptionType.BOOLEAN,
        description: "Detect users posting messages while appearing offline (invisible)",
        default: true,
        restartNeeded: true
    },
    invisibleBadgeDurationHours: {
        type: OptionType.NUMBER,
        description: "How many hours the invisible badge stays visible",
        default: 24
    }
});

// ---- Debounce utility ----
type DebouncedTask = (() => void) & { flush(): void; };

function createDebouncedTask(task: () => void, delay: number): DebouncedTask {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const fn = (() => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            timeout = undefined;
            task();
        }, delay);
    }) as DebouncedTask;

    fn.flush = () => {
        if (!timeout) return;
        clearTimeout(timeout);
        timeout = undefined;
        task();
    };

    return fn;
}

const schedulePersistSeen = createDebouncedTask(() => {
    void dsSet(SEEN_KEY, { ...lastSeenByUserId });
}, 400);

const schedulePersistOnline = createDebouncedTask(() => {
    void dsSet(ONLINE_KEY, { ...lastOnlineByUserId });
}, 2000);

const schedulePersistInvisible = createDebouncedTask(() => {
    void dsSet(INVISIBLE_KEY, [...invisibleDetections]);
}, 400);

function notifyUiSubscribers() {
    for (const l of uiListeners) l();
}

// ---- Tracking logic ----
function shouldTrackUser(userId: string): boolean {
    const me = UserStore.getCurrentUser()?.id;
    if (!me || userId === me) return false;

    if (RelationshipStore.isFriend(userId)) return true;

    try {
        const mine = GuildMemberStore.memberOf(me);
        const theirs = new Set(GuildMemberStore.memberOf(userId));
        return mine.some(g => theirs.has(g));
    } catch {
        return false;
    }
}

function isOnlineStatus(status: string | undefined): boolean {
    return status === "online" || status === "idle" || status === "dnd";
}

/**
 * Returns the best available timestamp for a user:
 *   1) Exact offline-transition time (lastSeenByUserId) — most accurate
 *   2) Last known online time (lastOnlineByUserId) — fallback
 *   3) undefined — no data at all
 */
function getBestTimestamp(userId: string): { ts: number; exact: boolean; } | null {
    const exact = lastSeenByUserId[userId];
    if (exact !== undefined) return { ts: exact, exact: true };
    const online = lastOnlineByUserId[userId];
    if (online !== undefined) return { ts: online, exact: false };
    return null;
}

function capturePresenceSnapshot() {
    lastKnownStatus.clear();
    const now = Date.now();
    let onlineChanged = false;
    try {
        for (const userId of PresenceStore.getUserIds()) {
            const status = PresenceStore.getStatus(userId);
            lastKnownStatus.set(userId, status);
            if (isOnlineStatus(status) && shouldTrackUser(userId)) {
                lastOnlineByUserId[userId] = now;
                onlineChanged = true;
            }
        }
    } catch { /* PresenceStore may not be ready */ }
    if (onlineChanged) schedulePersistOnline();
}

function backfillOfflineUsers() {
    capturePresenceSnapshot();
}

let periodicScanInterval: ReturnType<typeof setInterval> | undefined;

function startPeriodicScan() {
    stopPeriodicScan();
    periodicScanInterval = setInterval(() => {
        let seenChanged = false;
        let onlineChanged = false;
        const now = Date.now();
        try {
            for (const userId of PresenceStore.getUserIds()) {
                const currentStatus = PresenceStore.getStatus(userId);
                const prev = lastKnownStatus.get(userId);
                lastKnownStatus.set(userId, currentStatus);

                if (!shouldTrackUser(userId)) continue;

                if (isOnlineStatus(currentStatus)) {
                    lastOnlineByUserId[userId] = now;
                    onlineChanged = true;
                }

                if (currentStatus === "offline" && prev && prev !== "offline") {
                    lastSeenByUserId[userId] = now;
                    seenChanged = true;
                }
            }
        } catch { /* ignore */ }
        if (seenChanged) {
            notifyUiSubscribers();
            schedulePersistSeen();
        }
        if (onlineChanged) schedulePersistOnline();
    }, 5 * 60 * 1000);
}

function stopPeriodicScan() {
    if (periodicScanInterval) {
        clearInterval(periodicScanInterval);
        periodicScanInterval = undefined;
    }
}

function extractPresenceRows(ev: { type: string; updates?: any[] }): any[] {
    const u = ev?.updates;
    return Array.isArray(u) ? u : [];
}

function onPresenceUpdatesFlux(ev: { type: string; updates?: any[] }) {
    let seenChanged = false;
    let onlineChanged = false;
    const now = Date.now();

    for (const row of extractPresenceRows(ev)) {
        const userId = row?.user?.id as string | undefined;
        if (!userId || !shouldTrackUser(userId)) continue;

        const nextStatus = (row?.status as string | undefined) ?? PresenceStore.getStatus(userId);
        const prev = lastKnownStatus.get(userId);
        lastKnownStatus.set(userId, nextStatus);

        if (isOnlineStatus(nextStatus)) {
            lastOnlineByUserId[userId] = now;
            onlineChanged = true;
        }

        if (nextStatus === "offline" && prev !== undefined && prev !== "offline") {
            lastSeenByUserId[userId] = now;
            seenChanged = true;
        }
    }

    if (seenChanged) {
        notifyUiSubscribers();
        schedulePersistSeen();
    }
    if (onlineChanged) schedulePersistOnline();
}

function onConnectionOpenFlux() {
    capturePresenceSnapshot();
}

// ---- Invisible detection ----
function getRecentInvisibleDetection(userId: string): InvisibleDetection | null {
    const cutoff = Date.now() - (settings.store.invisibleBadgeDurationHours * 60 * 60 * 1000);
    for (let i = invisibleDetections.length - 1; i >= 0; i--) {
        const d = invisibleDetections[i];
        if (d.userId === userId && d.timestamp >= cutoff) return d;
    }
    return null;
}

function pruneOldDetections() {
    const cutoff = Date.now() - (settings.store.invisibleBadgeDurationHours * 60 * 60 * 1000);
    while (invisibleDetections.length > 0 && invisibleDetections[0].timestamp < cutoff) {
        invisibleDetections.shift();
    }
}

// ---- UI Components ----

function useLastSeenSubscription() {
    const [, bump] = useReducer((n: number) => n + 1, 0);

    useEffect(() => {
        uiListeners.add(bump);
        return () => void uiListeners.delete(bump);
    }, [bump]);

    useEffect(() => {
        const id = window.setInterval(() => bump(), 60_000);
        return () => void window.clearInterval(id);
    }, [bump]);
}

function formatRelativeTime(ts: number): string {
    return moment(ts).fromNow();
}

function formatAbsoluteTime(ts: number): string {
    return moment(ts).format("DD.MM.YYYY HH:mm:ss");
}

const EyeIcon = ({ size = 14 }: { size?: number; }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
    </svg>
);

const InvisibleBadge = ({ userId }: { userId: string; }) => {
    useLastSeenSubscription();

    const detection = getRecentInvisibleDetection(userId);
    if (!detection) return null;

    const tooltipText = `Invisible activity detected ${formatRelativeTime(detection.timestamp)}`;

    return (
        <Tooltip text={tooltipText}>
            {tooltipProps => (
                <span {...tooltipProps} className="vc-lst-invisible-icon">
                    <EyeIcon size={14} />
                </span>
            )}
        </Tooltip>
    );
};

function LastSeenText({ userId }: { userId: string; }) {
    const best = getBestTimestamp(userId);

    if (!best) {
        return (
            <Tooltip text="Never seen online while plugin was running">
                {tooltipProps => (
                    <span {...tooltipProps} className="vc-lst-member-tag">
                        Offline
                    </span>
                )}
            </Tooltip>
        );
    }

    const label = best.exact
        ? formatRelativeTime(best.ts)
        : `~${formatRelativeTime(best.ts)}`;

    const tooltip = best.exact
        ? formatAbsoluteTime(best.ts)
        : `Last seen online: ${formatAbsoluteTime(best.ts)}`;

    return (
        <Tooltip text={tooltip}>
            {tooltipProps => (
                <span {...tooltipProps} className="vc-lst-member-tag">
                    {label}
                </span>
            )}
        </Tooltip>
    );
}

const LastSeenMemberTag = ({ userId }: { userId: string; }) => {
    useLastSeenSubscription();

    const status = useStateFromStores([PresenceStore], () => PresenceStore.getStatus(userId));
    if (status !== "offline") return null;

    return <LastSeenText userId={userId} />;
};

const MutualServersList = ({ userId }: { userId: string; }) => {
    const [expanded, setExpanded] = useState(false);

    const mutualGuilds = useMemo(() => {
        try {
            const guilds = UserProfileStore?.getMutualGuilds(userId);
            if (!guilds || !Array.isArray(guilds)) return [];
            return guilds.map(g => {
                const guild = GuildStore.getGuild(g.guild?.id ?? g.id);
                return guild ? { id: guild.id, name: guild.name, icon: guild.icon } : null;
            }).filter(Boolean) as { id: string; name: string; icon: string | null; }[];
        } catch {
            return [];
        }
    }, [userId]);

    if (mutualGuilds.length === 0) return null;

    return (
        <div className="vc-lst-mutual-servers">
            <div
                className="vc-lst-mutual-servers-header"
                onClick={() => setExpanded(!expanded)}
            >
                <Text variant="text-sm/medium" color="header-secondary">
                    <span
                        className="vc-lst-mutual-servers-chevron"
                        data-expanded={expanded}
                    >
                        {"\u25B6 "}
                    </span>
                    Mutual Servers ({mutualGuilds.length})
                </Text>
            </div>
            {expanded && (
                <div className="vc-lst-mutual-servers-list">
                    {mutualGuilds.map(g => (
                        <div key={g.id} className="vc-lst-mutual-server-item">
                            {g.icon ? (
                                <img
                                    className="vc-lst-mutual-server-icon"
                                    src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.webp?size=32`}
                                    alt=""
                                />
                            ) : (
                                <span className="vc-lst-mutual-server-icon" style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: "var(--background-tertiary)",
                                    fontSize: "8px",
                                    color: "var(--text-muted)"
                                }}>
                                    {g.name.charAt(0)}
                                </span>
                            )}
                            <Text variant="text-xs/normal" color="text-normal">
                                {g.name}
                            </Text>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default definePlugin({
    name: "LastSeenTracker",
    description:
        "Tracks when users go offline, shows \"Last seen\" in member list and profiles, displays mutual servers, and detects invisible users.",
    authors: [{ name: "LastSeenTracker", id: 0n }],
    dependencies: ["MemberListDecoratorsAPI", "MessageDecorationsAPI"],
    settings,

    patches: [
        {
            find: ".SIDEBAR}),nicknameIcons",
            replacement: {
                match: /#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id)}\)}\)/,
                replace: "$&,$self.LastSeenTrackerRow({userId:$1,isSidebar:true})"
            },
            predicate: () => settings.store.showInPopout
        },
        {
            find: ",applicationRoleConnection:",
            replacement: {
                match: /#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\),/,
                replace: "$&,$self.LastSeenTrackerRow({userId:$1,isSidebar:false}),"
            },
            predicate: () => settings.store.showInPopout
        },
        {
            find: ".MODAL_V2,onClose:",
            replacement: {
                match: /#{intl::USER_PROFILE_MEMBER_SINCE}\),.{0,100}userId:(\i\.id),.{0,100}}\)}\),/,
                replace: "$&,$self.LastSeenTrackerRow({userId:$1,isSidebar:false}),"
            },
            predicate: () => settings.store.showInPopout
        }
    ],

    LastSeenTrackerRow: ErrorBoundary.wrap(
        ({ userId }: { userId: string; isSidebar: boolean; }) => {
            useLastSeenSubscription();

            if (!userId || userId === UserStore.getCurrentUser()?.id) return null;
            if (!shouldTrackUser(userId)) return null;

            const best = getBestTimestamp(userId);
            const invisibleDetection = settings.store.detectInvisible
                ? getRecentInvisibleDetection(userId)
                : null;

            if (!best && !invisibleDetection && !settings.store.showMutualServers) return null;

            return (
                <>
                    {settings.store.showInPopout && (
                        <Section>
                            <div className={WrapperClasses.memberSinceWrapper}>
                                <div className="vc-lst-popout-lastseen">
                                    <Text variant="text-sm/medium" color="header-secondary">
                                        Last seen
                                    </Text>
                                    {invisibleDetection && (
                                        <Tooltip text={`Invisible activity detected ${formatRelativeTime(invisibleDetection.timestamp)}`}>
                                            {tooltipProps => (
                                                <span {...tooltipProps} className="vc-lst-invisible-icon">
                                                    <EyeIcon size={14} />
                                                </span>
                                            )}
                                        </Tooltip>
                                    )}
                                </div>
                                <div className={ContainerClasses.memberSince}>
                                    {!best ? (
                                        <Tooltip text="Never seen online while plugin was running">
                                            {tooltipProps => (
                                                <Text {...tooltipProps} variant="text-sm/normal" color="text-muted" tag="span">
                                                    Unknown
                                                </Text>
                                            )}
                                        </Tooltip>
                                    ) : best.exact ? (
                                        <Tooltip text={formatAbsoluteTime(best.ts)}>
                                            {tooltipProps => (
                                                <Text {...tooltipProps} variant="text-sm/normal" color="text-muted" tag="span">
                                                    {formatRelativeTime(best.ts)}
                                                </Text>
                                            )}
                                        </Tooltip>
                                    ) : (
                                        <Tooltip text={`Last seen online: ${formatAbsoluteTime(best.ts)}`}>
                                            {tooltipProps => (
                                                <Text {...tooltipProps} variant="text-sm/normal" color="text-muted" tag="span">
                                                    ~{formatRelativeTime(best.ts)}
                                                </Text>
                                            )}
                                        </Tooltip>
                                    )}
                                </div>
                            </div>
                        </Section>
                    )}
                    {settings.store.showMutualServers && (
                        <MutualServersList userId={userId} />
                    )}
                </>
            );
        },
        { noop: true }
    ),

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: any; optimistic: boolean; }) {
            if (optimistic || !settings.store.detectInvisible) return;
            if (!message?.author?.id) return;

            const authorId = message.author.id;
            const me = UserStore.getCurrentUser()?.id;
            if (authorId === me) return;

            try {
                const status = PresenceStore.getStatus(authorId);
                if (status === "offline") {
                    const channel = ChannelStore.getChannel(message.channel_id);
                    invisibleDetections.push({
                        userId: authorId,
                        timestamp: Date.now(),
                        channelId: message.channel_id,
                        guildId: channel?.guild_id ?? null
                    });

                    if (invisibleDetections.length > 500) {
                        pruneOldDetections();
                    }

                    notifyUiSubscribers();
                    schedulePersistInvisible();
                }
            } catch { /* ignore */ }
        }
    },

    async start() {
        const seenBlob = (await dsGet<Record<string, number>>(SEEN_KEY)) ?? {};
        const onlineBlob = (await dsGet<Record<string, number>>(ONLINE_KEY)) ?? {};

        // Migration: wipe -1 sentinel values from previous version
        for (const [uid, ts] of Object.entries(seenBlob)) {
            if (ts === -1) delete seenBlob[uid];
        }

        Object.assign(lastSeenByUserId, seenBlob);
        Object.assign(lastOnlineByUserId, onlineBlob);

        const savedDetections = (await dsGet<InvisibleDetection[]>(INVISIBLE_KEY)) ?? [];
        invisibleDetections.push(...savedDetections);
        pruneOldDetections();

        capturePresenceSnapshot();

        FluxDispatcher.subscribe("CONNECTION_OPEN", onConnectionOpenFlux);
        FluxDispatcher.subscribe("PRESENCE_UPDATES", onPresenceUpdatesFlux);

        startPeriodicScan();

        if (settings.store.showInMemberList) {
            addMemberListDecorator("last-seen-tracker", ({ user }) => {
                if (!user || user.bot) return null;
                return (
                    <ErrorBoundary noop>
                        <LastSeenMemberTag userId={user.id} />
                        {settings.store.detectInvisible && <InvisibleBadge userId={user.id} />}
                    </ErrorBoundary>
                );
            });
        }

        if (settings.store.detectInvisible) {
            addMessageDecoration("lst-invisible-detector", props => {
                const authorId = props.message?.author?.id;
                if (!authorId) return null;
                return (
                    <ErrorBoundary noop>
                        <InvisibleBadge userId={authorId} />
                    </ErrorBoundary>
                );
            });
        }
    },

    stop() {
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", onConnectionOpenFlux);
        FluxDispatcher.unsubscribe("PRESENCE_UPDATES", onPresenceUpdatesFlux);

        stopPeriodicScan();
        schedulePersistSeen.flush();
        schedulePersistOnline.flush();
        schedulePersistInvisible.flush();
        uiListeners.clear();

        removeMemberListDecorator("last-seen-tracker");
        removeMessageDecoration("lst-invisible-detector");
    }
});
