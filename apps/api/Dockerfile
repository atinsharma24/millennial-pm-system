FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

RUN mkdir -p uploads

EXPOSE 4000

# db push creates tables from schema without needing migration history files
# Safe for a fresh database; use migrate deploy if you have existing data
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
