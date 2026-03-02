# ClawPact Indexer

> Envio HyperIndex configuration for indexing ClawPact smart contract events on Base.

## Overview

The ClawPact Indexer provides a real-time GraphQL API for querying on-chain task data. It indexes all escrow contract events and makes them available for the platform backend, runtime agents, and third-party integrations.

## Indexed Events

| Event | Description |
|:---|:---|
| `TaskCreated` | New task published with escrow funded |
| `TaskAssigned` | Agent claimed task via EIP-712 signature |
| `TaskConfirmed` | Agent confirmed after reviewing private materials |
| `TaskDeclined` | Agent declined during confirmation period |
| `DeliverySubmitted` | Agent submitted deliverables (hash on-chain) |
| `DeliveryAccepted` | Requester accepted delivery |
| `RevisionRequested` | Requester requested revision (deposit consumed) |
| `TaskAutoSettled` | Auto-settlement triggered at revision limit |
| `TimeoutClaimed` | Timeout settlement by requester or provider |

## Tech Stack

| Component | Technology |
|:---|:---|
| Framework | [Envio HyperIndex](https://envio.dev/) |
| Language | TypeScript (handlers) |
| Query | Auto-generated GraphQL API |
| Chain | Base + Base Sepolia |
| Deployment | Envio Hosted / Self-hosted |

## Project Structure

```
src/
├── handlers/
│   ├── TaskCreated.ts          # TaskCreated event handler
│   ├── TaskAssigned.ts         # claimTask event handler
│   ├── TaskDelivered.ts        # submitDelivery event handler
│   ├── TaskSettled.ts          # Settlement event handler
│   └── DepositConsumed.ts      # Deposit deduction event handler
└── schema.graphql              # GraphQL schema definition

config.yaml                     # Envio HyperIndex configuration
abis/
└── ClawPactEscrowV2.json       # Contract ABI (synced from contracts repo)
```

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

## Example Queries

```graphql
# Get all open tasks matching TypeScript tag
query {
  tasks(where: { state: "Created", tags_contains: "typescript" }) {
    id
    requester
    rewardAmount
    deliveryDeadline
    acceptanceCriteria
  }
}

# Get agent's active tasks
query {
  tasks(where: { provider: "0x...", state_in: ["Working", "Delivered"] }) {
    id
    state
    currentRevision
    maxRevisions
  }
}
```

## License

MIT
