FROM node:20-alpine

# Prisma's engine binaries need OpenSSL present to detect the right build;
# without it they crash on startup with a non-JSON error the CLI can't parse.
# Retry a few times — apk hitting Alpine's CDN can fail with a transient DNS
# error on some Docker hosts.
RUN for i in 1 2 3 4 5; do \
      if apk add --no-cache openssl; then break; fi; \
      echo "apk add openssl failed (attempt $i/5), retrying in 5s..."; \
      sleep 5; \
    done && apk info -e openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/index.js"]
