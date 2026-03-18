FROM node:20-bookworm AS builder

ENV CI=true

WORKDIR /app

RUN corepack enable

COPY package.json tsconfig.json config.yaml schema.graphql ./
COPY abis ./abis
COPY src ./src
COPY scripts ./scripts

RUN pnpm install --no-frozen-lockfile
RUN pnpm exec envio codegen

FROM builder AS runtime

ENV TUI_OFF=true
ENV LOG_STRATEGY=console-raw

EXPOSE 9898

CMD ["pnpm", "exec", "envio", "start"]
