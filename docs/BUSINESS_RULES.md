# BUSINESS_RULES.md — Regras de Negócio e Especificação Operacional

## 1. Arquitetura Multi-Tenant e Isolamento de Dados
1. **Hierarquia Operacional**: Toda entidade no sistema pertence a uma hierarquia estrita: **Tenant (Empresa) -> Unit (Unidade Física) -> Operação**.
2. **Isolamento Mandatório**: Todas as consultas e operações efetuadas pela API **devem** aplicar obrigatoriamente os filtros de `tenant_id` e, quando aplicável, `unit_id`.
3. **Acesso Multi-Unidade**: Um usuário pode estar associado a múltiplas unidades do mesmo Tenant via relação `user_units`, podendo alternar de contexto de trabalho no painel.

---

## 2. Política de Não Exclusão Física (Soft Delete & Auditoria)
1. **Proibição de Deletar**: É estritamente **proibido** apagar fisicamente registros das tabelas de Produtos, Clientes, Pedidos, Pagamentos, Estoque, Caixa e Movimentações Financeiras.
2. **Inativação e Cancelamento**:
   - Produtos e Categorias inativos recebem `status = INACTIVE`.
   - Pedidos, Itens e Pagamentos cancelados recebem `status = CANCELLED`.
3. **Auditoria Obrigatória**: Toda alteração de preço, cancelamento de venda, sangria/suprimento de caixa e ajuste de estoque deve registrar o usuário responsável, horário, IP e valores antes/depois na tabela `audit_logs` e/ou `cancellations`.

---

## 3. Gestão de Usuários, Perfis e Permissões Granulares (RBAC)
1. **Perfis Padrão**:
   - `ADMIN` / `PROPRIETARIO`: Gestão completa de todas as unidades, configurações e finanças.
   - `GERENTE`: Operação gerencial da unidade, aprovação de cancelamentos, sangrias e ajustes de estoque.
   - `CAIXA`: Operação de balcão, lançamento de vendas, recebimentos e controle do caixa.
   - `GARCOM`: Lançamento em mesas e comandas, consulta de cardápio via aplicativo operacional.
   - `COZINHA`: Visualização e alteração de status de produção no KDS.
   - `EXPEDICAO`: Conferência de pedidos e liberação para entrega.
   - `ENTREGADOR`: Aceite de chamados de entrega e atualização do status de transporte.
   - `ESTOQUISTA`: Lançamento de compras, fornecedores e movimentações de estoque.
2. **Permissões Granulares**: O sistema deve validar permissões pontuais por ação (exemplo: `orders.create`, `orders.cancel`, `cash.open`, `cash.reopen`, `price.update`). Operações sensíveis (como dar desconto ou cancelar pedido) exigem permissão específica ou autorização do gerente.

---

## 4. Cadastro de Produtos, Preços por Unidade e Ficha Técnica (Receitas)
1. **Preços Diferenciados por Unidade**:
   - O produto é cadastrado na tabela `products`, mas o preço de venda (`price`), custo (`cost_price`) e estoque mínimo (`stock_min`) são definidos por unidade na tabela `product_units`.
2. **Variações e Complementos/Adicionais**:
   - Produtos podem possuir variações (`product_variants`, ex: Pizza Pequena, Média, Grande).
   - Grupos de complementos e adicionais podem ser configurados com regras de obrigatoriedade, quantidade mínima e quantidade máxima (ex: Ponto da carne - obrigatório 1; Adicional de bacon - opcional máx 3).
3. **Ficha Técnica e Baixa Automática de Estoque**:
   - Cada produto/variação pode ter uma ficha técnica associada (`recipes` e `recipe_items`).
   - **Regra de Ouro da Venda**: Ao confirmar a venda de um produto (ex: X-Bacon), o sistema consulta a receita e realiza a **baixa automática proporcional dos insumos** no estoque da unidade (ex: -1 pão, -180g carne, -30g queijo).

---

## 5. Operação de Caixa e PDV / Balcão
1. **Ciclo de Vida da Sessão de Caixa**:
   - **Abertura**: O operador deve informar o valor do fundo de caixa (`opening_amount`).
   - **Movimentações**: Durante o turno, registros de `SALE` (vendas), `WITHDRAWAL` (sangria/retiradas) e `DEPOSIT` (suprimentos/aportes) são auditados.
   - **Fechamento**: O operador informa o valor contado em dinheiro/moedas (`counted_amount`). O sistema calcula automaticamente o valor esperado (`expected_amount`) e registra eventuais diferenças (`difference`).
2. **PDV / Vendas de Balcão**:
   - Lançamento rápido de itens por busca textual, código de barras ou atalhos de categoria.
   - Suporte a **Múltiplos Pagamentos** em um único pedido (ex: Pedido R$ 150,00 -> R$ 100,00 via PIX + R$ 50,00 em Dinheiro).
   - Métodos suportados: Dinheiro, PIX, Cartão de Crédito, Cartão de Débito, Vale Refeição/Alimentação, Outros.

---

## 6. Salão, Comandas, Mapa de Mesas e QR Code
1. **Status do Mapa de Mesas**:
   - `AVAILABLE` (Livre), `OCCUPIED` (Ocupada), `RESERVED` (Reservada), `BLOCKED` (Bloqueada).
2. **Operações de Comanda**:
   - Abertura vinculando garçom, mesa e cliente opcional.
   - Lançamento contínuo de itens com observações de preparo (ex: "Sem cebola", "Ao ponto").
   - Transferência de itens entre comandas ou mudança de mesa.
   - Divisão de conta (por número de pessoas ou por itens consumidos).
   - Fechamento parcial ou total com liberação da mesa após quitação.
3. **Cardápio Digital QR Code**:
   - O cliente lê o QR Code da mesa, acessa o cardápio e faz o pedido. O pedido cai diretamente no KDS/cozinha associado à mesa correspondente.

---

## 7. Monitor de Produção da Cozinha (KDS)
1. **Fluxo de Estados do Pedido**:
   `RECEBIDO` ➔ `ACEITO` ➔ `EM PREPARO` ➔ `PRONTO` ➔ `EM EXPEDIÇÃO` ➔ `SAIU PARA ENTREGA` ➔ `ENTREGUE`.
2. **Sincronização em Tempo Real**: Alterações de status no KDS emitem eventos via WebSocket para atualizar instantaneamente o painel de atendimento, o PDV e o rastreamento do cliente.

---

## 8. Delivery, Zonas de Entrega e Checkout Online
1. **Configuração de Zonas**: Taxas de entrega e prazos estimados são definidos por bairro/região (`delivery_zones`).
2. **Validações do Checkout**: Validação de valor mínimo do pedido, horário de funcionamento do estabelecimento e raio de atendimento.
3. **Rastreamento**: O cliente acompanha em tempo real o avanço do status do pedido no portal Web.

---

## 9. Gestão de Entregadores
1. Atribuição de pedidos prontos para entregadores cadastrados.
2. Aceite de chamados, visualização de rotas de entrega e confirmação de entrega pelo aplicativo do entregador.

---

## 10. Controle de Estoque, Compras e Fornecedores
1. **Tipos de Movimentação (`inventory_movements`)**:
   - `PURCHASE` (Entrada por Compra)
   - `SALE` (Saída por Venda/Receita)
   - `CANCELLATION` (Estorno por Cancelamento)
   - `LOSS` (Perda/Avaria)
   - `ADJUSTMENT` (Ajuste de Inventário)
   - `TRANSFER_IN` / `TRANSFER_OUT` (Transferência entre Unidades)
2. **Alertas de Estoque Crítico**: O sistema emite alertas automáticos no dashboard quando a quantidade em estoque atinge o nível igual ou inferior ao `stock_min`.
3. **Módulo de Compras**: Registro de Notas Fiscais/Compras vinculadas ao Fornecedor (`suppliers`). A confirmação da compra incrementa o estoque e atualiza o custo médio do insumo.

---

## 11. Cancelamentos, Descontos e Trilha de Auditoria
1. **Cancelamentos de Pedidos/Itens**:
   - Exigem obrigatoriamente a seleção de um **Motivo Configurável** (ex: "Erro de lançamento", "Cliente desistiu", "Item indisponível").
   - Exigem permissão de perfil Gerente/Admin.
   - Registram se os itens devem ou não retornar ao estoque (`inventory_movement`).
2. **Registros de Auditoria (`audit_logs`)**:
   - Registram quem, o que, quando e os valores antes/depois para qualquer alteração em preços, permissões, dados cadastrais e estornos.
