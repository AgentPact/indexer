import { AgentPactEscrow, AgentPactTipJar } from "../generated";

type TaskState =
    | "CREATED"
    | "WORKING"
    | "DELIVERED"
    | "IN_REVISION"
    | "ACCEPTED"
    | "SETTLED"
    | "CANCELLED"
    | "TIMED_OUT";

function taskEntityId(escrowId: bigint) {
    return escrowId.toString();
}

function timelineEntityId(event: any) {
    return `${event.transaction.hash}:${event.logIndex}`;
}

async function loadTask(context: any, escrowId: bigint) {
    const id = taskEntityId(escrowId);
    const existing = await context.TaskProjection.get(id);

    if (existing) {
        return existing;
    }

    // When the first event we see for this escrow isn't `EscrowCreated` (e.g.
    // handler retry, multi-chain ordering quirks, or an index rebuild replaying
    // in a different order than the live feed), we fall back to this
    // placeholder. The defaults deliberately use block/timestamp = 0 so that
    // any real subsequent event wins the `bumpTask` monotonic guard below.
    return {
        id,
        escrowId: id,
        taskHash: undefined,
        requester: undefined,
        provider: undefined,
        token: undefined,
        rewardAmount: undefined,
        requesterDeposit: undefined,
        providerPayout: undefined,
        platformFee: undefined,
        requesterRefund: undefined,
        compensation: undefined,
        status: "CREATED" as TaskState,
        currentRevision: 0,
        maxRevisions: undefined,
        acceptanceWindowHours: undefined,
        criteriaCount: undefined,
        declineCount: 0,
        passRate: undefined,
        confirmationDeadline: undefined,
        deliveryDeadline: undefined,
        acceptanceDeadline: undefined,
        lastEventName: "EscrowCreated",
        lastUpdatedBlock: 0n,
        lastUpdatedAt: 0n,
    };
}

async function upsertTask(context: any, escrowId: bigint, patch: Record<string, unknown>) {
    const current = await loadTask(context, escrowId);
    const next = { ...current, ...patch };
    context.TaskProjection.set(next);
}

// Merge `patch` into the existing projection while preserving every field the
// stored projection already learned from a later block. The new event is
// treated as an older out-of-order event, so we:
//  - never overwrite `status` (newer event already moved it forward)
//  - never rewind `lastUpdatedBlock` / `lastUpdatedAt` / `lastEventName`
//  - fill in fields that the later event didn't yet populate (e.g. the
//    requester, taskHash, or fund-weight metadata a late `EscrowCreated` can
//    still contribute to a task that already entered WORKING)
async function fillMissingFields(
    context: any,
    escrowId: bigint,
    patch: Record<string, unknown>,
    existing: Record<string, unknown>
) {
    const fillOnly: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
        if (key === "status") continue;
        if (existing[key] === undefined || existing[key] === null) {
            fillOnly[key] = value;
        }
    }
    if (Object.keys(fillOnly).length === 0) return;
    const next = { ...existing, ...fillOnly };
    context.TaskProjection.set(next);
}

function normalizeAddress(value: string | null | undefined) {
    return value ? value.toLowerCase() : undefined;
}

async function addTimelineEvent(context: any, event: any, escrowId: bigint, eventName: string, actor?: string | null, data?: unknown) {
    context.TaskTimelineEvent.set({
        id: timelineEntityId(event),
        taskId: taskEntityId(escrowId),
        escrowId: escrowId.toString(),
        eventName,
        txHash: event.transaction.hash,
        blockNumber: BigInt(event.block.number),
        logIndex: Number(event.logIndex),
        timestamp: BigInt(event.block.timestamp),
        actor: normalizeAddress(actor),
        data: data == null ? undefined : JSON.stringify(data),
    });
}

async function bumpTask(context: any, event: any, escrowId: bigint, patch: Record<string, unknown>, actor?: string | null, data?: unknown) {
    const eventBlock = BigInt(event.block.number);
    const existing = await loadTask(context, escrowId);
    const existingBlock = BigInt(existing.lastUpdatedBlock ?? 0n);

    // Timeline events are always written: they describe a real on-chain log
    // and tolerate duplicates thanks to their composite id (txHash:logIndex).
    await addTimelineEvent(context, event, escrowId, String(patch.lastEventName ?? "UNKNOWN"), actor, data);

    if (existingBlock > 0n && eventBlock < existingBlock) {
        // Out-of-order late event: never rewind status or the high-water mark,
        // but still contribute fields the projection hasn't yet learned.
        await fillMissingFields(context, escrowId, patch, existing);
        return;
    }

    if (existingBlock === eventBlock) {
        // Same-block events can still arrive out of logIndex order. Apply the
        // patch but keep the high-water mark where it was; relying on the
        // later logIndex to win naturally would need a logIndex-aware cursor.
        // For now we accept the latest-wins behaviour within a single block,
        // which matches the status machine's monotonic progression along the
        // standard event sequence (Created → Working → Delivered → ...).
    }

    await upsertTask(context, escrowId, {
        ...patch,
        lastUpdatedBlock: eventBlock,
        lastUpdatedAt: BigInt(event.block.timestamp),
    });
}

async function bumpUserTipStats(context: any, user: string, direction: "sent" | "received", amount: bigint, fee: bigint, timestamp: bigint) {
    const id = `${user.toLowerCase()}:${direction}`;
    const current = await context.UserTipStats.get(id);

    context.UserTipStats.set({
        id,
        direction,
        totalAmount: (BigInt(current?.totalAmount ?? "0") + amount).toString(),
        totalFee: (BigInt(current?.totalFee ?? "0") + fee).toString(),
        tipCount: Number(current?.tipCount ?? 0) + 1,
        lastTipAt: timestamp,
    });
}

async function bumpPostTipStats(context: any, postId: string, amount: bigint, fee: bigint, timestamp: bigint) {
    const current = await context.PostTipStats.get(postId);

    context.PostTipStats.set({
        id: postId,
        totalAmount: (BigInt(current?.totalAmount ?? "0") + amount).toString(),
        totalFee: (BigInt(current?.totalFee ?? "0") + fee).toString(),
        tipCount: Number(current?.tipCount ?? 0) + 1,
        lastTipAt: timestamp,
    });
}

AgentPactEscrow.EscrowCreated.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            taskHash: event.params.taskHash,
            requester: normalizeAddress(event.params.requester),
            token: normalizeAddress(event.params.token),
            rewardAmount: event.params.rewardAmount.toString(),
            requesterDeposit: event.params.requesterDeposit.toString(),
            status: "CREATED",
            currentRevision: 0,
            maxRevisions: Number(event.params.maxRevisions),
            acceptanceWindowHours: Number(event.params.acceptanceWindowHours),
            criteriaCount: Number(event.params.criteriaCount),
            lastEventName: "EscrowCreated",
        },
        event.params.requester,
        {
            deliveryDurationSeconds: event.params.deliveryDurationSeconds.toString(),
        }
    );
});

AgentPactEscrow.TaskClaimed.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            provider: normalizeAddress(event.params.provider),
            status: "WORKING",
            deliveryDeadline: BigInt(event.params.deliveryDeadline),
            lastEventName: "TaskClaimed",
        },
        event.params.provider
    );
});

AgentPactEscrow.TaskSuspendedAfterDeclines.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            // On-chain the contract leaves the escrow in Created state after
            // three declines — the suspension is a platform-layer concept
            // tracked via the event name. Keep `status` aligned with the
            // actual contract state machine and use lastEventName for the
            // off-chain behavioural signal.
            status: "CREATED",
            declineCount: Number(event.params.declineCount),
            lastEventName: "TaskSuspendedAfterDeclines",
        }
    );
});

AgentPactEscrow.TaskAbandoned.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            // Abandon returns the escrow to the contract's Created state so
            // the task becomes available for re-matching. The event name
            // preserves the "was abandoned" context for downstream
            // projections that care about it.
            provider: null,
            status: "CREATED",
            lastEventName: "TaskAbandoned",
        },
        event.params.provider
    );
});

AgentPactEscrow.DeliverySubmitted.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            status: "DELIVERED",
            currentRevision: Number(event.params.revision),
            acceptanceDeadline: BigInt(event.params.acceptanceDeadline),
            lastEventName: "DeliverySubmitted",
        },
        undefined,
        {
            deliveryHash: event.params.deliveryHash,
        }
    );
});

AgentPactEscrow.RevisionRequested.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            status: "IN_REVISION",
            currentRevision: Number(event.params.currentRevision),
            passRate: Number(event.params.passRate),
            lastEventName: "RevisionRequested",
        },
        undefined,
        {
            reasonHash: event.params.reasonHash,
            criteriaResultsHash: event.params.criteriaResultsHash,
            depositPenalty: event.params.depositPenalty.toString(),
        }
    );
});

AgentPactEscrow.DeliveryAccepted.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            status: "ACCEPTED",
            providerPayout: event.params.providerPayout.toString(),
            platformFee: event.params.platformFee.toString(),
            lastEventName: "DeliveryAccepted",
        }
    );
});

AgentPactEscrow.TaskAutoSettled.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            // Contract state is `Settled`; keep the status aligned. Consumers
            // that need the auto-settlement signal can read `lastEventName`.
            status: "SETTLED",
            passRate: Number(event.params.passRate),
            providerPayout: event.params.providerShare.toString(),
            requesterRefund: event.params.requesterRefund.toString(),
            platformFee: event.params.platformFee.toString(),
            lastEventName: "TaskAutoSettled",
        }
    );
});

AgentPactEscrow.TaskCancelled.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            status: "CANCELLED",
            compensation: event.params.compensation.toString(),
            lastEventName: "TaskCancelled",
        }
    );
});

AgentPactEscrow.TimeoutClaimed.handler(async ({ event, context }: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            status: "TIMED_OUT",
            lastEventName: "TimeoutClaimed",
        },
        event.params.claimedBy,
        {
            previousState: Number(event.params.previousState),
        }
    );
});

AgentPactTipJar.TipSent.handler(async ({ event, context }: any) => {
    const timestamp = BigInt(event.block.timestamp);
    const amount = BigInt(event.params.amount);
    const fee = BigInt(event.params.fee);
    const from = normalizeAddress(event.params.from)!;
    const to = normalizeAddress(event.params.to)!;
    const id = `${event.transaction.hash}:${event.logIndex}`;

    context.TipProjection.set({
        id,
        txHash: event.transaction.hash,
        from,
        to,
        postId: event.params.postId,
        amount: amount.toString(),
        fee: fee.toString(),
        blockNumber: BigInt(event.block.number),
        timestamp,
    });

    await bumpPostTipStats(context, event.params.postId, amount, fee, timestamp);
    await bumpUserTipStats(context, from, "sent", amount, fee, timestamp);
    await bumpUserTipStats(context, to, "received", amount, fee, timestamp);
});
