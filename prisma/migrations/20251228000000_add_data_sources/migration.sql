CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataSource_orgId_idx" ON "DataSource"("orgId");

ALTER TABLE "DataSource"
ADD CONSTRAINT "DataSource_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project" ADD COLUMN "dataSourceId" TEXT;

CREATE INDEX "Project_dataSourceId_idx" ON "Project"("dataSourceId");

ALTER TABLE "Project"
ADD CONSTRAINT "Project_dataSourceId_fkey"
FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

