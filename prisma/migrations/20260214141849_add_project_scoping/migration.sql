-- RenameIndex
ALTER INDEX "public"."DistributionEvent_projectId_primaryEntityType_primaryEntityId_i" RENAME TO "DistributionEvent_projectId_primaryEntityType_primaryEntity_idx";

-- RenameIndex
ALTER INDEX "public"."EntityRelation_projectId_fromEntityType_fromEntityId_relatio_ke" RENAME TO "EntityRelation_projectId_fromEntityType_fromEntityId_relati_key";
