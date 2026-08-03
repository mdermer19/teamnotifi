-- Secure one-time web report links (SMS becomes the entry point only).

CREATE TABLE "report_tokens" (
    "id"            SERIAL       NOT NULL,
    "token_hash"    TEXT         NOT NULL,
    "employee_id"   INTEGER      NOT NULL,
    "state"         TEXT         NOT NULL DEFAULT 'CONFIRM_DATE',
    "context"       JSONB        NOT NULL DEFAULT '{}',
    "state_history" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status"        TEXT         NOT NULL DEFAULT 'active',
    "absence_id"    INTEGER,
    "expires_at"    TIMESTAMP(3) NOT NULL,
    "submitted_at"  TIMESTAMP(3),
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_tokens_token_hash_key" ON "report_tokens"("token_hash");
CREATE UNIQUE INDEX "report_tokens_absence_id_key"  ON "report_tokens"("absence_id");
CREATE INDEX "report_tokens_employee_id_status_idx" ON "report_tokens"("employee_id", "status");

ALTER TABLE "report_tokens"
  ADD CONSTRAINT "report_tokens_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "report_tokens"
  ADD CONSTRAINT "report_tokens_absence_id_fkey"
  FOREIGN KEY ("absence_id") REFERENCES "absences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Concurrency guarantee #1: at most one ACTIVE token per employee.
-- A plain composite index cannot enforce this; a partial unique index can.
-- Two simultaneous inbound texts => one INSERT wins, the other gets P2002
-- and is resolved by re-reading the winner, so both send the same link.
CREATE UNIQUE INDEX "report_tokens_one_active_per_employee"
    ON "report_tokens"("employee_id")
    WHERE "status" = 'active';

-- The Workflow settings page lists rows from this table, so these must exist
-- for the new options to be visible and editable. Defaults are deliberately
-- conservative: the web form is OFF, so applying this migration alone changes
-- nothing about how the app behaves.
INSERT INTO "workflow_settings" ("key", "value", "label", "type", "description", "updated_at") VALUES
  ('web_report_flow_enabled', 'false', 'Use Web Form Instead of Text Conversation', 'boolean',
   'When enabled, texting in returns a single secure link and the employee answers the questions on a web page instead of over SMS. When disabled, the original text conversation runs unchanged.', NOW()),
  ('report_token_ttl_minutes', '120', 'Report Link Expires After (minutes)', 'number',
   'How long a report link stays usable before the employee must text in again for a new one.', NOW()),
  ('report_token_max_per_hour', '5', 'Max Report Links Per Hour', 'number',
   'Safety limit on how many links one employee can be sent in an hour, so repeated texts cannot flood their phone.', NOW()),
  ('report_link_dedupe_seconds', '60', 'Ignore Repeat Texts Within (seconds)', 'number',
   'If someone texts again this soon after getting a link, no second link is sent. Prevents duplicate carrier messages from replacing a link the employee is already using.', NOW()),
  ('confirm_sms_enabled', 'true', 'Send Confirmation Text After Submitting', 'boolean',
   'When enabled, the employee also gets a short confirmation text for their records after finishing the web form. The web confirmation screen is shown either way.', NOW())
ON CONFLICT ("key") DO NOTHING;

-- Concurrency guarantee #2: never two absences for the same employee+date,
-- regardless of which flow (legacy SMS or new web) created them. This is the
-- real backstop behind the existing read-then-write findFirst() check.
-- Verified safe: zero duplicate (employee_id, shift_date) rows exist.
CREATE UNIQUE INDEX "absences_employee_shift_date_key"
    ON "absences"("employee_id", "shift_date");
