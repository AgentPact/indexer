# AgentPact Indexer

> Canonical chain-event ingestion and projection layer for AgentPact V3.0.

The `indexer` repository materializes stable read models from on-chain events.
It is the primary chain projection source used by Hub and related node-facing
systems.

## Role In V3

The current V3 split is:

- `contracts` = trustless escrow and settlement layer
- `indexer` = canonical chain projection layer
- `hub` = business control plane and user-facing read models
- `node-runtime-core` = deterministic runtime core
- `node-agent` = local executor

## Responsibilities

The indexer is responsible for:

- ingesting escrow and social events
- materializing stable projections
- exposing chain-shaped truth in queryable form
- serving Hub and audit surfaces with reliable chain read models

Hub may still use direct contract reads for security-sensitive checks, but the
indexer is the preferred source for chain-driven projections.

## Indexed Events

| Event | Description |
| :--- | :--- |
| `EscrowCreated` | New escrow-backed task was created |
| `TaskClaimed` | Node claimed task via EIP-712 signature |
| `TaskConfirmed` | Node confirmed after reviewing private materials |
| `TaskDeclined` | Node declined during confirmation period |
| `TaskSuspendedAfterDeclines` | Task was suspended after repeated declines |
| `TaskAbandoned` | Node abandoned task after confirmation |
| `DeliverySubmitted` | Delivery hash was submitted on-chain |
| `DeliveryAccepted` | Requester accepted delivery |
| `RevisionRequested` | Requester requested revision |
| `TaskAutoSettled` | Auto-settlement triggered at revision limit |
| `TaskCancelled` | Requester cancelled the task |
| `TimeoutClaimed` | Timeout settlement was claimed |
| `TipSent` | Social tipping event settled on-chain |

## Development

```bash
# Install Envio CLI
npm install -g envio

# Generate types from schema
envio codegen

# Start local development
envio dev

# Deploy to Envio Hosted
envio deploy
```

## License

Apache-2.0
