CREATE TABLE "order_splits" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_splits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_split_items" (
    "id" TEXT NOT NULL,
    "split_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "order_split_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payments" ADD COLUMN "split_id" TEXT;
CREATE INDEX "order_splits_order_id_status_idx" ON "order_splits"("order_id", "status");
CREATE UNIQUE INDEX "order_split_items_split_id_order_item_id_key" ON "order_split_items"("split_id", "order_item_id");
CREATE INDEX "order_split_items_order_item_id_idx" ON "order_split_items"("order_item_id");
CREATE INDEX "payments_split_id_idx" ON "payments"("split_id");

ALTER TABLE "order_splits" ADD CONSTRAINT "order_splits_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_split_items" ADD CONSTRAINT "order_split_items_split_id_fkey"
  FOREIGN KEY ("split_id") REFERENCES "order_splits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_split_items" ADD CONSTRAINT "order_split_items_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_split_id_fkey"
  FOREIGN KEY ("split_id") REFERENCES "order_splits"("id") ON DELETE SET NULL ON UPDATE CASCADE;