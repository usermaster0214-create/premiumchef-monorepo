DELETE FROM "delivery_zones" AS duplicate
USING "delivery_zones" AS canonical
WHERE duplicate."unit_id" = canonical."unit_id"
  AND duplicate."name" = canonical."name"
  AND duplicate."id" > canonical."id";

CREATE UNIQUE INDEX "delivery_zones_unit_id_name_key"
ON "delivery_zones"("unit_id", "name");