# Especificação Técnica de API e WebSockets - PremiumChef

Documento de especificação técnica dos endpoints RESTful, DTOs, headers obrigatórios e gateways WebSocket do backend NestJS do **PremiumChef**.

---

## 1. Visão Geral e Convenções

* **Base URL**: `/api/v1`
* **Formato de Dados**: `application/json`
* **Padrão de Resposta de Erro**: RFC 7807 (Problem Details)
* **Padrão de Autenticação**: Bearer JWT (`Authorization: Bearer <token>`)

### Headers Obrigatórios Contextuais
Todas as requisições para rotas protegidas devem enviar os headers contextuais do tenant e unidade:

| Header | Tipo | Descrição |
| :--- | :--- | :--- |
| `Authorization` | `String` | `Bearer <JWT_TOKEN>` contendo `sub`, `tenant_id` e permissões. |
| `X-Tenant-ID` | `UUID` | Identificador único da empresa (Tenant). |
| `X-Unit-ID` | `UUID` | Identificador único da unidade física / filial. |

---

## 2. Autenticação, Usuários e RBAC (`/auth`, `/users`, `/roles`)

### 2.1 Login
* **`POST /api/v1/auth/login`**
* **Acesso**: Público
* **Request Body (DTO)**:
  ```json
  {
    "email": "operador@restaurante.com",
    "password": "senha_segura_123"
  }
  ```
* **Response Body (200 OK)**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "def456...",
    "user": {
      "id": "uuid-user-1",
      "name": "Carlos Silva",
      "email": "operador@restaurante.com",
      "tenant_id": "uuid-tenant-1",
      "units": ["uuid-unit-1"],
      "roles": ["CAIXA", "GARCOM"],
      "permissions": ["orders.create", "orders.read", "cash.open", "cash.close"]
    }
  }
  ```

### 2.2 Refresh Token
* **`POST /api/v1/auth/refresh`**
* **Request Body**: `{ "refresh_token": "def456..." }`
* **Response**: `{ "access_token": "new_token...", "refresh_token": "new_refresh..." }`

### 2.3 Obter Dados do Usuário Logado
* **`GET /api/v1/auth/me`**
* **Headers**: `Authorization`
* **Response**: Dados do perfil, unidades autorizadas e lista granular de permissões.

---

## 3. Catálogo e Cardápio (`/categories`, `/products`, `/addons`)

### 3.1 Listar Categorias
* **`GET /api/v1/categories`**
* **Query Params**: `?status=ACTIVE`
* **Permissão**: `products.read`
* **Response**: Array de categorias ordenadas por `sort_order`.

### 3.2 Criar e manter categorias
* **`POST /api/v1/categories`**: cria categoria (`products.create`), com `name`, `description`, `image_url` opcional e `sort_order` opcional.
* **`GET /api/v1/categories/:id`**: retorna uma categoria do tenant atual (`products.read`).
* **`PATCH /api/v1/categories/:id`**: atualiza dados da categoria (`products.update`).
* **`PATCH /api/v1/categories/:id/status`**: altera `ACTIVE`/`INACTIVE`; não há exclusão física (`products.update`).

### 3.3 Produtos, preços por unidade e variações
* **`GET /api/v1/products`**: aceita `status`, `category_id` e `search`; inclui preço/custo/estoque mínimo da unidade selecionada (`products.read`).
* **`GET /api/v1/products/:id`**: retorna produto, variações ativas, adicionais ativos e ficha técnica ativa (`products.read`).
* **`POST /api/v1/products`**: cria produto e preço para a unidade do header `X-Unit-ID` (`products.create`). O DTO aceita `category_id`, `name`, `price`, `cost_price`, `stock_min`, `variants`, `addons` e `recipe_items`.
* **`PATCH /api/v1/products/:id`**: atualiza dados e preço da unidade; alterações de composição inativam a versão anterior em vez de apagá-la (`products.update`).
* **`PATCH /api/v1/products/:id/status`**: ativa/inativa o produto sem exclusão física (`products.update`).
* **`POST /api/v1/products/:id/variants`**, **`PATCH /api/v1/products/:id/variants/:variantId`** e **`PATCH /api/v1/products/:id/variants/:variantId/status`**: mantém variações, inativando-as em vez de removê-las (`products.create`/`products.update`).
* **`PUT /api/v1/products/:id/recipe`**: substitui a ficha técnica em transação e mantém versões anteriores inativas (`products.update`).

### 3.4 Adicionais e imagens
* **`GET /api/v1/addons?status=ACTIVE`**, **`POST /api/v1/addons`**, **`PATCH /api/v1/addons/:id`** e **`PATCH /api/v1/addons/:id/status`**: consulta e mantém adicionais (`products.read`, `products.create`, `products.update`).
* **`POST /api/v1/products/:id/image`** e **`POST /api/v1/categories/:id/image`**: upload `multipart/form-data`, campo `image`; aceita JPEG, PNG ou WebP até 5 MB e retorna a URL pública R2. O conteúdo é validado pelo formato real do arquivo.

### 3.5 Exemplo de criação de produto com receita
* **`POST /api/v1/products`**
* **Permissão**: `products.create`
* **Request Body (DTO)**:
  ```json
  {
    "category_id": "uuid-cat-1",
    "name": "X-Bacon Artesanal",
    "description": "Pão brioche, hambúrguer 180g, queijo cheddar e bacon duplo.",
    "sku": "HAMB-001",
    "price": 32.90,
    "cost_price": 12.50,
    "type": "FOOD",
    "is_delivery": true,
    "is_pos": true,
    "image_url": "https://r2.premiumchef.com/products/x-bacon.png",
    "recipe_items": [
      { "ingredient_product_id": "uuid-pao-1", "quantity": 1, "unit": "UN" },
      { "ingredient_product_id": "uuid-carne-1", "quantity": 0.180, "unit": "KG" },
      { "ingredient_product_id": "uuid-bacon-1", "quantity": 0.080, "unit": "KG" }
    ]
  }
  ```

### 3.6 Catálogo público de Delivery
* **`GET /api/v1/delivery/public/:unitId/catalog`**: retorna somente produtos ativos marcados para delivery, com preço da unidade, variações e adicionais ativos. Não exige JWT; a unidade é resolvida para o tenant antes da consulta.
* **`GET /api/v1/delivery/public/:unitId/zones`**: retorna zonas de entrega ativas, taxa e prazo estimado da unidade.
* **`POST /api/v1/delivery/public/:unitId/checkout`**: cria/atualiza cliente, persiste endereço, cria pedido `DELIVERY` e registro `Delivery` `PENDING`. O pagamento retorna como `PENDING` até integração com o provedor externo.
* A tela Web pública usa `NEXT_PUBLIC_DELIVERY_UNIT_ID`, mantém o carrinho localmente e calcula subtotal + taxa da zona selecionada.

---

## 4. Vendas, Pedidos e Comandas (`/orders`, `/tables`)

### 4.1 Criar Pedido (Balcão, Mesa, Delivery)
* **`POST /api/v1/orders`**
* **Permissão**: `orders.create`
* **Request Body (DTO)**:
  ```json
  {
    "order_type": "DINE_IN", // DINE_IN, COUNTER, TAKEAWAY, DELIVERY
    "customer_id": "uuid-customer-1", // Opcional
    "table_id": "uuid-table-05",     // Obrigatório se DINE_IN
    "notes": "Sem cebola em todos os hambúrgueres",
    "items": [
      {
        "product_id": "uuid-prod-xbacon",
        "quantity": 2,
        "unit_price": 32.90,
        "notes": "Ao ponto",
        "options": [
          { "addon_id": "uuid-addon-bacon-extra", "quantity": 1, "unit_price": 5.00 }
        ]
      }
    ]
  }
  ```
* **Response Body (201 Created)**:
  ```json
  {
    "id": "uuid-order-100",
    "order_number": 1542,
    "status": "RECEIVED",
    "subtotal": 70.80,
    "discount": 0.00,
    "total": 70.80,
    "kitchen_tickets": [
      { "id": "uuid-ticket-1", "status": "WAITING" }
    ]
  }
  ```
* O `unit_price` enviado pelo cliente não é uma fonte confiável: a API resolve preço da unidade, variação e adicional no banco.
* `OrderItem.product_name`, `OrderItem.unit_price`, `OrderItemOption.addon_name` e `OrderItemOption.unit_price` são snapshots físicos da venda.
* Pedidos `DINE_IN` ocupam a mesa na mesma transação e geram um `KitchenTicket` para a unidade.

### 4.1.1 Quitação e baixa de ficha técnica
* Ao concluir o pagamento, a API baixa proporcionalmente os insumos das receitas ativas no estoque da unidade.
* Cada baixa cria `InventoryMovement` com tipo `SALE`, quantidade anterior, quantidade nova e referência do pedido.
* Saldo insuficiente aborta a transação inteira: pagamentos, caixa, estoque e conclusão do pedido não são persistidos parcialmente.

### 4.2 Alterar Status do Pedido
* **`PATCH /api/v1/orders/:id/status`**
* **Permissão**: `orders.update`
* **Request Body**: `{ "status": "PREPARING" }` // RECEIVED, ACCEPTED, PREPARING, READY, DISPATCHED, DELIVERED, CANCELLED

### 4.3 Operações de comanda
* **`POST /api/v1/orders/:id/items`**: adiciona item e adicionais a uma comanda aberta (`orders.update`), recalcula o total e cria ticket de cozinha para a nova produção.
* **`PATCH /api/v1/orders/:id/table`**: transfere a comanda para outra mesa (`orders.update`) dentro de transação; a mesa anterior só é liberada quando não possui outra comanda aberta.
* **`GET /api/v1/orders/:id/splits`**: consulta as divisões persistidas (`orders.read`).
* **`POST /api/v1/orders/:id/splits`**: cria divisão por itens (`item_ids`) ou por valor (`amount`); o total das divisões deve ser exatamente o total do pedido (`orders.update`).
* A inclusão e transferência rejeitam pedidos concluídos/cancelados e respeitam o tenant/unidade dos headers contextuais.

---

## 5. Operação de Caixa e Financeiro (`/cash-sessions`, `/payments`)

### 5.1 Abertura de Caixa
* **`POST /api/v1/cash-sessions/open`**
* **Permissão**: `cash.open`
* **Request Body (DTO)**:
  ```json
  {
    "cash_register_id": "uuid-register-01",
    "opening_amount": 200.00
  }
  ```

### 5.2 Registrar Pagamento (Suporte a Pagamento Múltiplo)
* **`POST /api/v1/orders/:id/payments`**
* **Permissão**: `orders.pay`
* **Request Body (DTO)**:
  ```json
  {
    "payments": [
      { "payment_method": "PIX", "amount": 50.00 },
      { "payment_method": "CASH", "amount": 20.80 }
    ]
  }
  ```
* A soma dos pagamentos deve quitar exatamente o saldo restante do pedido.
* Para contas divididas, envie `split_id` no corpo; cada divisão é quitada separadamente.
* O pedido só é concluído e a mesa só é liberada quando todos os splits estiverem pagos.
* Pagamentos em dinheiro exigem sessão de caixa aberta e geram uma movimentação `SALE` automaticamente.
* Os pagamentos, o movimento de caixa e a conclusão do pedido são gravados na mesma transação.

### 5.3 Sangria / Suprimento de Caixa
* **`POST /api/v1/cash-sessions/:id/movements`**
* **Permissão**: `cash.movement`
* **Request Body (DTO)**:
  ```json
  {
    "type": "WITHDRAWAL", // WITHDRAWAL (Sangria), DEPOSIT (Suprimento)
    "amount": 150.00,
    "description": "Retirada para pagamento de fornecedor de hortifrúti"
  }
  ```

### 5.4 Consultar e fechar sessão de caixa
* **`GET /api/v1/cash-sessions/current`**
* **Permissão**: `cash.read`
* **Resposta**: sessão aberta do operador, caixa vinculado e movimentações em ordem cronológica.
* **`PATCH /api/v1/cash-sessions/:id/close`**
* **Permissão**: `cash.close`
* **Request Body**: `{ "counted_amount": 245.50 }`
* **Resposta**: sessão fechada com `expected_amount`, `counted_amount` e `difference`.
* Abertura, movimentação e fechamento são transações atômicas e sempre filtram tenant/unidade.

---

## 6. Cozinha - Monitor KDS (`/kitchen-tickets`)

### 6.1 Listar Tickets em Aberto na Cozinha
* **`GET /api/v1/kitchen-tickets`**
* **Query Params**: `?status=WAITING,PREPARING`
* **Permissão**: `kitchen.view`

### 6.2 Atualizar Status do Ticket de Produção
* **`PATCH /api/v1/kitchen-tickets/:id/status`**
* **Permissão**: `kitchen.update`
* **Request Body**: `{ "status": "READY" }` // WAITING, PREPARING, READY, DELIVERED

---

## 7. Estoque, Compras e Cancelamentos (`/inventory`, `/purchases`, `/cancellations`)

### 7.1 Lançar Movimentação Manual de Estoque
* **`POST /api/v1/inventory/movements`**
* **Permissão**: `inventory.adjust`
* **Request Body (DTO)**:
  ```json
  {
    "product_id": "uuid-prod-queijo",
    "type": "LOSS", // LOSS, ADJUSTMENT, ENTRY, EXIT
    "quantity": 1.5,
    "reason": "Validade vencida"
  }
  ```
* **`GET /api/v1/inventory?critical=true`**: lista inventário crítico quando quantidade está igual ou abaixo do mínimo.
* Movimentos manuais rejeitam tipos gerados automaticamente (`PURCHASE`, `SALE`, `CANCELLATION`) e nunca permitem saldo negativo.

### 7.1.1 Compras e fornecedores
* **`GET /api/v1/purchases`**: lista compras da unidade (`purchases.read`).
* **`POST /api/v1/purchases`**: confirma compra com itens, fornecedor opcional e nota fiscal (`purchases.create`).
* A confirmação atualiza inventário, cria `InventoryMovement.PURCHASE` e recalcula o custo médio do produto na unidade dentro da mesma transação.

### 7.2 Cancelamento Auditado de Pedido ou Item
* **`POST /api/v1/cancellations`**
* **Permissão**: `orders.cancel`
* **Request Body (DTO)**:
  ```json
  {
    "order_id": "uuid-order-100",
    "order_item_id": "uuid-item-1", // Opcional (se null, cancela o pedido todo)
    "reason": "Cliente desistiu da espera",
    "type": "ORDER"
  }
  ```

---

## 8. Gateways e Eventos WebSocket (Tempo Real)

A comunicação bidirecional em tempo real é gerenciada via **Socket.IO** no NestJS.

### 8.1 Handshake e Autenticação WS
* **Endpoint Connection**: `wss://api.premiumchef.com/socket.io`
* **Auth Query**: `?token=<JWT_TOKEN>&tenant_id=<UUID>&unit_id=<UUID>`
* **Salas (Rooms)**: O cliente é alocado automaticamente na sala `unit:{unit_id}` ao conectar.

### 8.2 Gateways e Namespaces

#### **Gateway 1: Cozinha / KDS (`/ws/kds`)**
* **Evento Recebido do Servidor (`kitchen:ticket_created`)**:
  ```json
  {
    "event": "kitchen:ticket_created",
    "data": {
      "ticket_id": "uuid-ticket-99",
      "order_number": 1543,
      "order_type": "DINE_IN",
      "table_number": "04",
      "items": [
        { "product_name": "X-Bacon", "quantity": 2, "notes": "Sem salada" }
      ],
      "created_at": "2026-09-24T18:45:00Z"
    }
  }
  ```
* **Evento Emitido pelo Cliente (`kitchen:update_status`)**:
  ```json
  {
    "ticket_id": "uuid-ticket-99",
    "status": "PREPARING"
  }
  ```

* **REST `GET /api/v1/kitchen-tickets?status=WAITING,PREPARING,READY`**: carga inicial dos tickets da unidade (`kitchen.view`).
* **REST `PATCH /api/v1/kitchen-tickets/:id/status`**: atualiza status com transição validada e sincroniza itens/pedido (`kitchen.update`).
* **Evento emitido pelo servidor (`kitchen:ticket_updated`)**: `{ "ticket_id": "uuid", "previous_status": "WAITING", "status": "PREPARING", "order_status": "PREPARING" }` para a sala `unit:{unit_id}`.

#### **Gateway 2: Gestão de Pedidos e Balcão (`/ws/orders`)**
* **Evento Emitido pelo Servidor (`order:status_changed`)**:
  ```json
  {
    "event": "order:status_changed",
    "data": {
      "order_id": "uuid-order-100",
      "order_number": 1542,
      "previous_status": "PREPARING",
      "new_status": "READY"
    }
  }
  ```

#### **Gateway 3: Delivery e Rastreamento (`/ws/delivery`)**
* **Evento Emitido pelo Servidor (`delivery:driver_location`)**:
  ```json
  {
    "event": "delivery:driver_location",
    "data": {
      "delivery_id": "uuid-del-12",
      "driver_name": "João Entregador",
      "latitude": -23.550520,
      "longitude": -46.633308
    }
  }
  ```

### 8.3 Operações de entregadores
* **`GET /api/v1/delivery-drivers`** e **`POST /api/v1/delivery-drivers`**: lista e cadastra entregadores ativos (`delivery.drivers.read`, `delivery.drivers.create`).
* **`GET /api/v1/deliveries`**: lista entregas da unidade com pedido, endereço e entregador (`delivery.read`).
* **`PATCH /api/v1/deliveries/:id/driver`**: atribui entregador ativo do tenant (`delivery.assign`).
* **`PATCH /api/v1/deliveries/:id/status`**: aplica o fluxo `PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED`, com cancelamento permitido antes da entrega (`delivery.update`).
* **Evento recebido (`delivery:update_location`)**: `{ "delivery_id": "uuid", "latitude": -23.55, "longitude": -46.63 }`.
* **Evento emitido (`delivery:driver_location`)**: transmitido para `unit:{unit_id}` após validar entregador, status em rota e coordenadas.

---

## 9. Tabela de Permissões Mapeadas por Rota (RBAC)

| Módulo | Endpoint | Permissão Exigida |
| :--- | :--- | :--- |
| **Autenticação** | `POST /auth/login` | *Público* |
| **Produtos** | `POST /products` | `products.create` |
| **Produtos** | `DELETE /products/:id` | `products.delete` |
| **Pedidos** | `POST /orders` | `orders.create` |
| **Pedidos** | `POST /cancellations` | `orders.cancel` |
| **Caixa** | `POST /cash-sessions/open` | `cash.open` |
| **Caixa** | `POST /cash-sessions/close` | `cash.close` |
| **Cozinha** | `GET /kitchen-tickets` | `kitchen.view` |
| **Estoque** | `POST /inventory/movements` | `inventory.adjust` |
| **Relatórios** | `GET /reports/*` | `reports.view` |

### 9.1 Relatórios e dashboard
* **`GET /api/v1/reports/summary?from=2026-09-01&to=2026-09-30`**: retorna vendas totais, quantidade de pedidos pagos, ticket médio, canais, formas de pagamento, produtos mais vendidos, estoque crítico e cancelamentos do tenant/unidade.
* Sem datas, o período padrão é os últimos 30 dias.
* O dashboard Web está disponível em `/reports` e consome exclusivamente essa consulta protegida por `reports.view`.

### 9.2 Health check e publicação
* **`GET /api/v1/health`**: endpoint público usado pelo Railway para verificar disponibilidade da API.
* A API usa Helmet, CORS por `CORS_ORIGINS` e throttling global.
* `apps/api/railway.json` aplica migrations antes de iniciar a API; `apps/web/railway.json` executa o build/start do Next.
* Builds EAS ficam em `apps/mobile/eas.json`; use `corepack pnpm mobile:preview` para APK interno ou `corepack pnpm mobile:production` para produção, após autenticar no EAS.
