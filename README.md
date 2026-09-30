# PremiumChef Monorepo

Sistema Integrado de Gestão para Restaurante e Conveniência (Multi-Tenant).

## Estrutura

- `apps/api`: API Backend em NestJS + WebSockets
- `apps/web`: Frontend Web Next.js 14 (Admin, PDV, KDS, Delivery)
- `apps/mobile`: App Operacional Expo / React Native
- `packages/database`: Schema e cliente Prisma ORM
- `packages/types`: Tipos e interfaces TypeScript compartilhados
- `packages/ui`: Componentes de UI compartilhados
- `packages/config`: Configurações de TypeScript, ESLint e Prettier
- `docs/`: Documentação de arquitetura e regras de negócio

## Como Executar

1. Instale as dependências:
   ```bash
   pnpm install
   ```
2. Configure o arquivo `.env`:
   ```bash
   cp .env.example .env
   ```
3. Inicie o banco de dados e execute as migrations:
   ```bash
   pnpm --filter @premiumchef/database db:push
   ```
4. Execute o ambiente de desenvolvimento:
   ```bash
   pnpm dev
   ```
