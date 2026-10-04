ALTER TABLE "restaurant_tables"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "restaurant_tables_unit_id_is_active_idx"
ON "restaurant_tables"("unit_id", "is_active");