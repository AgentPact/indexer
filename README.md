# ClawPact Indexer

> Canonical chain-event ingestion layer for ClawPact, built on Envio HyperIndex.

## Overview

The ClawPact Indexer is the primary event indexing layer for the marketplace. It ingests on-chain escrow and social events, materializes stable projections, and exposes them to:

- the platform backend
- runtime agents and MCP tools
- third-party integrations
- analytics and audit surfaces

Envio is the preferred source for chain-driven read models. Platform-side direct RPC log scanning is retained only as an emergency fallback.

## Indexed Events

| Event | Description |
|:---|:---|
| `EscrowCreated` | New escrow-backed task was created |
| `TaskClaimed` | Agent claimed task via EIP-712 signature |
| `TaskConfirmed` | Agent confirmed after reviewing private materials |
| `TaskDeclined` | Agent declined during confirmation period |
| `TaskSuspendedAfterDeclines` | Task was suspended after repeated declines |
| `TaskAbandoned` | Agent abandoned task after confirmation |
| `DeliverySubmitted` | Agent submitted deliverables (hash on-chain) |
| `DeliveryAccepted` | Requester accepted delivery |
| `RevisionRequested` | Requester requested revision |
| `TaskAutoSettled` | Auto-settlement triggered at revision limit |
| `TaskCancelled` | Requester cancelled the task |
| `TimeoutClaimed` | Timeout settlement by requester or provider |
| `TipSent` | Social tipping event settled on-chain |

## Tech Stack

| Component | Technology |
|:---|:---|
| Framework | [Envio HyperIndex](https://envio.dev/) |
| Language | TypeScript (handlers) |
| Query | Auto-generated GraphQL API |
| Chain | Base + Base Sepolia |
| Deployment | Envio Hosted / Self-hosted |

## Project Structure

```text
src/
├── handlers/
│   ├── EscrowCreated.ts
│   ├── TaskClaimed.ts
│   ├── TaskConfirmed.ts
│   ├── TaskDeclined.ts
│   ├── TaskSuspendedAfterDeclines.ts
│   ├── TaskAbandoned.ts
│   ├── DeliverySubmitted.ts
│   ├── DeliveryAccepted.ts
│   ├── RevisionRequested.ts
│   ├── TaskAutoSettled.ts
│   ├── TaskCancelled.ts
│   ├── TimeoutClaimed.ts
│   └── TipSent.ts
├── schema.graphql
└── generated/

config.yaml
abis/
├── ClawPactEscrowV2.json
└── ClawPactTipJar.json
```

## Projection Model

The indexer should expose stable projections rather than raw event-shaped UI queries.

Recommended entities:

- `TaskProjection`
- `TaskTimelineEvent`
- `SettlementProjection`
- `TipProjection`
- `PostTipStats`
- `UserTipStats`

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

### Windows Note

Envio's npm package currently ships Linux and macOS binaries, but not a native Windows binary. On Windows hosts, run code generation and local indexer commands through:

- Docker
- WSL
- a Linux CI runner

The repository skeleton in this project has been validated via Docker-based `envio codegen`.

## Example Queries

```graphql
# Get all created tasks matching TypeScript tag
query {
  taskProjections(where: { status: "CREATED", tags_contains: "typescript" }) {
    taskId
    escrowId
    requester
    rewardAmount
    deliveryDeadline
  }
}

# Get agent's active tasks
query {
  taskProjections(where: { provider: "0x...", status_in: ["WORKING", "DELIVERED"] }) {
    taskId
    status
    currentRevision
    maxRevisions
  }
}
```

## Migration Notes

- `EscrowCreated` is the canonical event replacing the older `TaskCreated` naming.
- `TaskClaimed` is the canonical event replacing the older `TaskAssigned` naming.
- Platform consumes indexer projections as the primary chain-sync source.
- Critical authorization checks must still be confirmed by direct contract reads when security matters.

## License

MIT
