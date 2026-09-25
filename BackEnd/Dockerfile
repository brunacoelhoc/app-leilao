# syntax=docker/dockerfile:1

# ===== Etapa 1: build =====
# Instala TODAS as dependencias (incl. dev, precisa do @nestjs/cli e do
# typescript pra compilar) e gera o build de producao
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Gera o client do Prisma ANTES do build (o schema.prisma manda escrever em
# src/generated/prisma -- por isso precisa existir antes do "nest build"
# compilar o resto de src/ para dist/)
RUN npx prisma generate

RUN npm run build

# ===== Etapa 2: producao =====
# Imagem final enxuta: so o necessario pra rodar, sem devDependencies nem
# codigo fonte em TypeScript
FROM node:24-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# So o que o app compilado e o "prisma migrate deploy" (que roda no start,
# ver docker-compose.yml) realmente precisam em tempo de execucao
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/prisma/migrations ./prisma/migrations

# Pasta dos uploads, fora do Git -- vira volume no docker-compose.yml, pra
# os arquivos enviados sobreviverem a um rebuild/restart do container
RUN mkdir -p uploads

EXPOSE 3092

# Aplica as migrations pendentes (idempotente: nao faz nada se ja estiver em
# dia) e so entao sobe a API -- assim o container sempre inicia com o banco
# no schema certo, sem precisar de um passo manual separado
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
