import { AgentPactEscrow, AgentPactTipJar } from "generated";

type TaskState =
    | "CREATED"
    | "CONFIRMATION_PENDING"
    | "WORKING"
    | "DELIVERED"
    | "IN_REVISION"
    | "ACCEPTED"
    | "AUTO_SETTLED"
    | "CANCELLED"
    | "ABANDONED"
    | "SUSPENDED"
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

    return {
        id,
        escrowId: id,
        taskHash: null,
        requester: null,
        provider: null,
        token: null,
        rewardAmount: null,
        requesterDeposit: null,
        providerPayout: null,
        platformFee: null,
        requesterRefund: null,
        compensation: null,
        status: "CREATED" as TaskState,
        currentRevision: 0,
        maxRevisions: null,
        acceptanceWindowHours: null,
        criteriaCount: null,
        declineCount: 0,
        passRate: null,
        confirmationDeadline: null,
        deliveryDeadline: null,
        acceptanceDeadline: null,
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

function normalizeAddress(value: string | null | undefined) {
    return value ? value.toLowerCase() : null;
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
        data: data == null ? null : JSON.stringify(data),
    });
}

async function bumpTask(context: any, event: any, escrowId: bigint, patch: Record<string, unknown>, actor?: string | null, data?: unknown) {
    await upsertTask(context, escrowId, {
        ...patch,
        lastUpdatedBlock: BigInt(event.block.number),
        lastUpdatedAt: BigInt(event.block.timestamp),
    });
    await addTimelineEvent(context, event, escrowId, String(patch.lastEventName ?? "UNKNOWN"), actor, data);
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

AgentPactEscrow.EscrowCreated.handler(async (event: any, context: any) => {
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

AgentPactEscrow.TaskClaimed.handler(async (event: any, context: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            provider: normalizeAddress(event.params.provider),
            status: "CONFIRMATION_PENDING",
            confirmationDeadline: BigInt(event.params.confirmationDeadline),
            lastEventName: "TaskClaimed",
        },
        event.params.provider
    );
});

AgentPactEscrow.TaskConfirmed.handler(async (event: any, context: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            provider: normalizeAddress(event.params.provider),
            status: "WORKING",
            deliveryDeadline: BigInt(event.params.deliveryDeadline),
            lastEventName: "TaskConfirmed",
        },
        event.params.provider
    );
});

AgentPactEscrow.TaskDeclined.handler(async (event: any, context: any) => {
    const current = await loadTask(context, event.params.escrowId);
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            provider: normalizeAddress(event.params.provider),
            status: "CREATED",
            declineCount: Number(current.declineCount ?? 0) + 1,
            lastEventName: "TaskDeclined",
        },
        event.params.provider
    );
});

AgentPactEscrow.TaskSuspendedAfterDeclines.handler(async (event: any, context: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            status: "SUSPENDED",
            declineCount: Number(event.params.declineCount),
            lastEventName: "TaskSuspendedAfterDeclines",
        }
    );
});

AgentPactEscrow.TaskAbandoned.handler(async (event: any, context: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            provider: normalizeAddress(event.params.provider),
            status: "ABANDONED",
            lastEventName: "TaskAbandoned",
        },
        event.params.provider
    );
});

AgentPactEscrow.DeliverySubmitted.handler(async (event: any, context: any) => {
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
        null,
        {
            deliveryHash: event.params.deliveryHash,
        }
    );
});

AgentPactEscrow.RevisionRequested.handler(async (event: any, context: any) => {
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
        null,
        {
            reasonHash: event.params.reasonHash,
            criteriaResultsHash: event.params.criteriaResultsHash,
            depositPenalty: event.params.depositPenalty.toString(),
        }
    );
});

AgentPactEscrow.DeliveryAccepted.handler(async (event: any, context: any) => {
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

AgentPactEscrow.TaskAutoSettled.handler(async (event: any, context: any) => {
    await bumpTask(
        context,
        event,
        event.params.escrowId,
        {
            status: "AUTO_SETTLED",
            passRate: Number(event.params.passRate),
            providerPayout: event.params.providerShare.toString(),
            requesterRefund: event.params.requesterRefund.toString(),
            platformFee: event.params.platformFee.toString(),
            lastEventName: "TaskAutoSettled",
        }
    );
});

AgentPactEscrow.TaskCancelled.handler(async (event: any, context: any) => {
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

AgentPactEscrow.TimeoutClaimed.handler(async (event: any, context: any) => {
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

AgentPactTipJar.TipSent.handler(async (event: any, context: any) => {
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
