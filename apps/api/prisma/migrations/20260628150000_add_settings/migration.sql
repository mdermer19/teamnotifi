CREATE TABLE "message_templates" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "variables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    "updated_by" TEXT,
    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_templates_key_key" ON "message_templates"("key");

CREATE TABLE "workflow_settings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "workflow_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_settings_key_key" ON "workflow_settings"("key");
