# PROJECT_SPEC.md — Especificação Técnica e Arquitetural

## 1. Visão Geral do Projeto
O **PremiumChef** é um **Sistema Integrado de Gestão para Restaurantes e Conveniências (ERP / PDV / KDS / Delivery / Estoque / Financeiro)** projetado desde a fundação como um produto **Multi-tenant SaaS**. 

A solução unifica a operação de balcão, atendimento de mesas/comandas, cardápio digital/delivery online, produção na cozinha e controle financeiro/estoque em uma única plataforma integrada em tempo real.

---

## 2. Experiências do Usuário e Interfaces

1. **Painel Administrativo / Web (Next.js + TypeScript)**
   - **Público**: Administrador, Gerente, Caixa, Atendente, Estoquista.
   - **Dispositivos**: Computador, Notebook e Tablet.
   - **Funcionalidades**: PDV/Balcão, Mapa de Mesas, Fechamento de Caixa, Controle de Estoque e Compras, Gestão de Cardápio, Relatórios Gerenciais e Configurações Multi-tenant.

2. **Aplicativo Operacional Unificado (Expo + React Native + TypeScript)**
   - **Público**: Garçom, Caixa, Cozinha/KDS e Entregador.
   - **Dispositivos**: Smartphones e Tablets Android/iOS.
   - **Funcionalidade**: A interface adapta-se dinamicamente às telas permitidas de acordo com a função (role) do usuário logado.

3. **Portal do Cliente / Delivery (Next.js responsivo)**
   - **Público**: Consumidor final.
   - **Dispositivos**: Smartphones, Tablets e Desktops.
   - **Funcionalidades**: Cardápio digital online, carrinho de compras, checkout com endereço e pagamento, acompanhamento do pedido em tempo real e leitura de QR Code em mesas.

---

## 3. Arquitetura Técnica e Stack de Tecnologias

### **Estratégia Arquitetural**: Monólito Modular + API RESTful / WebSockets

```
                        INTERNET (Cloudflare)
                                  │
         ┌────────────────────────┴────────────────────────┐
         │                                                 │
    WEBSITE / DELIVERY                               APPLICATIVO MOBILE
     (Next.js + TS)                                   (Expo / React Native)
         │                                                 │
         └────────────────────────┬────────────────────────┘
                                  │
                               API REST / WS
                               (NestJS + TS)
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
    PostgreSQL                 Redis                   Cloudflare R2
 (Banco Relacional)       (Cache & Filas)          (Armazenamento Objetos)
```

### **Tech Stack Confirmada**:
- **Frontend Web**: Next.js (App Router), React, TypeScript, Tailwind CSS, Shadcn UI / Lucide Icons.
- **Backend API**: NestJS, TypeScript, WebSockets (Socket.io/Gateways) para atualizações em tempo real (KDS/Delivery).
- **Mobile**: Expo / React Native, TypeScript (Builds automatizados via Expo EAS para Google Play e App Store).
- **Banco de Dados**: PostgreSQL gerenciado (Railway) com ORM Prisma.
- **Cache e Mensageria**: Redis (Gerenciamento de sessões, cache e filas de background).
- **Armazenamento de Arquivos**: Cloudflare R2 (Fotos de produtos, comprovantes, banners e documentos via API compatível com S3).
- **Autenticação e Segurança**: JWT + Refresh Token, Controle de Acesso Baseado em Papéis (RBAC) granular e Registro de Auditoria (`audit_logs`).

---

## 4. Estrutura do Monorepo

O código-fonte é organizado em um monorepo para facilitar o compartilhamento de tipos, validações e componentes entre as aplicações:

```
restaurant-system/
├── apps/
│   ├── web/            # Next.js (Painel Web, PDV e Delivery)
│   ├── api/            # NestJS API (Regras de negócio, REST, WebSockets)
│   └── mobile/         # Expo / React Native (App Operacional Unificado)
│
├── packages/
│   ├── database/       # Schema Prisma, migrations e seeds
│   ├── types/          # DTOs, Interfaces e Tipos compartilhados
│   ├── validation/     # Schemas Zod de validação
│   ├── ui/             # Componentes visuais compartilhados
│   └── config/         # Configurações de Eslint, Prettier e TSConfig
│
├── docs/               # Documentação técnica viva (PROJECT_SPEC, DATABASE, etc.)
├── pnpm-workspace.yaml
└── README.md
```

---

## 5. Módulos do Sistema e Mapa de Telas

1. **SISTEMA E SEGURANÇA**: Autenticação, Controle de Tenant/Unidades, Perfis (Roles), Permissões Granulares, Audit Logs.
2. **CADASTRO E PRODUTOS**: Categorias, Produtos, Variações (P/M/G), Adicionais, Preços por Unidade, Ficha Técnica / Receitas, Upload R2.
3. **VENDAS E PDV / BALCÃO**: Interface rápida de caixa, atalhos por categoria, busca rápida, múltiplos pagamentos, sangria e suprimento.
4. **SALÃO E COMANDAS**: Mapa de mesas interativo, abertura de comanda, transferência, junção, divisão de conta, fechamento parcial/total, QR Code na mesa.
5. **PRODUÇÃO / KDS**: Monitor de cozinha em tempo real com Kanban de estados (Recebido -> Aceito -> Em Preparo -> Pronto -> Expedição -> Entregue).
6. **DELIVERY E RASTREAMENTO**: Cardápio online responsivo, cálculo de taxa por zona de entrega, pedido mínimo, checkout, acompanhamento de status.
7. **GESTAO DE ENTREGADORES**: Atribuição de pedidos, rotas, aceite pelo app do entregador.
8. **ESTOQUE E COMPRAS**: Movimentações (Entrada, Saída, Perda, Ajuste, Venda), Baixa automática por receita, Fornecedores, Pedidos de Compra.
9. **FINANCEIRO E CAIXA**: Abertura, fechamento com conciliação (valor esperado vs. contado), sangrias, suprimentos, histórico operacional.
10. **RELATÓRIOS E DASHBOARDS**: DRE simples, curva ABC de produtos, vendas por canal/forma de pagamento, estoque crítico, cancelamentos auditados.

---

## 6. Infraestrutura e Ambientes

- **Hospedagem API e Web**: Railway (Serviço Node.js para API NestJS, Web Next.js e serviço Redis).
- **Banco de Dados**: PostgreSQL Gerenciado no Railway com suporte a `DATABASE_URL` resiliente.
- **Arquivos/Mídia**: Cloudflare R2 com URLs CDN de alta performance.
- **Domínios e Subdomínios**:
  - `app.premiumchef.com.br` — Painel Administrativo / PDV
  - `api.premiumchef.com.br` — API Central
  - `pedido.premiumchef.com.br` — Delivery e Cardápio Digital

---

## 7. Roadmap de Desenvolvimento e Metodologia de IA

O projeto é executado em **11 Fases Sequenciais**, com branches dedicadas do Git (`feature/auth`, `feature/products`, etc.) e prompts curtos e específicos para agentes de IA:

- **Fase 1**: Fundação, Autenticação, Multi-tenant e RBAC
- **Fase 2**: Produtos, Categorias, Variações e Ficha Técnica
- **Fase 3**: PDV / Balcão e Operação de Caixa
- **Fase 4**: Comandas e Mapa de Mesas
- **Fase 5**: Cozinha (KDS e WebSocket)
- **Fase 6**: Delivery e Checkout Online
- **Fase 7**: Módulo de Entrega e Entregadores
- **Fase 8**: Controle de Estoque e Compras
- **Fase 9**: Relatórios e Dashboards
- **Fase 10**: Aplicativo Mobile Operacional (Expo)
- **Fase 11**: Publicação, Testes e Deploy
