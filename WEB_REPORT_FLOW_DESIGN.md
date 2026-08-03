# TeamNotifi — SMS-to-Web Report Flow: Design (Approved, Revised)

**Status: Approved for implementation on branch `feature/web-report-flow`. No production deployment.**

Revised per decisions of 2026-08-03. Changes from the original proposal are marked **[REVISED]**.

---

## 1. High-level architecture

**Today:** Employee texts in → Twilio webhook → `handler.js` state machine keyed by phone (`SmsSession`) → 4–10 back-and-forth texts, parsed with regex/AI → absence logged → manager notified.

**New (flag-gated):** Employee texts in → webhook identifies them → mints (or reuses) a random, single-use, expiring token → sends **one** SMS containing `teamnotifi.com/r/{token}` → employee completes the flow as a mobile web form, one question per screen, answers saved server-side immediately → on the final answer the absence is logged exactly as today → manager notified exactly as today → employee gets one confirmation SMS for their records.

**Side benefit:** one outbound SMS per report instead of 4–10, which structurally removes the carrier-latency exposure diagnosed earlier — a slightly delayed link text is an inconvenience, not a stalled conversation.

---

## 2. **[REVISED]** Rollout: both workflows live, flag-selected

The existing conversational SMS handler stays **fully intact and functional**. Nothing is removed, and no conversational state is deleted.

- New workflow setting: **`web_report_flow_enabled`**, default `'false'`.
- The webhook branches at the top of `handleInbound()`:
  - `'false'` → existing conversational flow runs, byte-for-byte unchanged.
  - `'true'` → new link flow.
- Flipping the flag is a database change, no redeploy, instant rollback.
- The old SMS states, `session.js`, `SmsSession`, and `ai.js` all remain in place and are **not** scheduled for removal in this change. Cleanup only happens in a much later, separate change, after the web flow has been stable in production for a meaningful period.

---

## 3. Reuse inventory

### Reused unchanged
- **`notify.js`** (`notifyManager`, `resolveRecipients`, `buildMessage`) — fires identically once an `Absence` row exists.
- **`WorkflowSetting` toggles** (`multi_day_prompt_enabled`, `dr_note_prompt_enabled`, `proof_prompt_enabled`) — decide which web screens appear, same as they decide which SMS prompts appear today.
- **`AbsenceReason`**, **`businessDate.js`**, **`settingsCache.js`** mechanics.
- **Entire admin dashboard** — `Absences.jsx`, `ConversationModal.jsx`, `Today.jsx`, `ExceptionReport.jsx`, `Employees.jsx`, `Permissions.jsx`, `Layout.jsx`, all existing API routes, Clerk auth. Zero changes. They read `Absence`/`Notification`/`SmsMessage`, which look identical regardless of origin.
- **STOP/QUIT/UNSUBSCRIBE** handling — untouched (carrier compliance).
- **The entire existing conversational SMS handler** — see §2.

### Added, not replaced
- `buildVars()` and `logAbsence()` are **copied into** a new shared module `workflow/absenceWorkflow.js` and the SMS handler is left importing its own originals. This guarantees the new flow cannot regress the old one. De-duplication happens during the later cleanup, not now.

### Modified
- `handler.js` — one branch added at the top; existing code untouched below it.
- `settingsCache.js` — new `WEB_*` template set, `LINK_SENT`, `CONFIRM_SMS_*` set, new workflow settings.
- `index.js` — mount the public report router before the Clerk gate.
- `schema.prisma` + migration — new `ReportToken` model, two reverse relations, two unique indexes.
- `App.jsx` — top-level routing restructure so `/r/:token` renders outside the Clerk gate.

---

## 4. **[REVISED]** Separate web template set

Web copy and SMS copy are **fully independent**. Editing an SMS template can never change a web screen and vice versa.

Two distinct groups in `MessageTemplate`, both editable on the Settings page:

| Web screen | Web template key | (Independent SMS analogue) |
|---|---|---|
| Date picker | `WEB_DATE_TITLE` / `WEB_DATE_HELP` | `CONFIRM_DATE` |
| Reason buttons | `WEB_REASON_TITLE` | `SELECT_REASON` |
| Multi-day Y/N | `WEB_MULTIDAY_TITLE` | `MULTI_DAY_PROMPT` |
| Return date | `WEB_RETURN_DATE_TITLE` / `WEB_RETURN_DATE_HELP` | `RETURN_DATE_PROMPT` |
| Doctor's note Y/N | `WEB_SICK_NOTE_TITLE` / `WEB_SICK_NOTE_HELP` | `SICK_NOTE_PROMPT` |
| Emergency details | `WEB_EMERG_DETAILS_TITLE` / `WEB_EMERG_DETAILS_HELP` | `FAMILY_DETAILS_PROMPT` |
| Proof Y/N | `WEB_PROOF_TITLE` / `WEB_PROOF_HELP` | `FAMILY_PROOF_PROMPT` |
| Late arrival time | `WEB_LATE_TIME_TITLE` / `WEB_LATE_TIME_HELP` | `LATE_ARRIVAL_TIME_PROMPT` |
| Other details | `WEB_OTHER_DETAILS_TITLE` / `WEB_OTHER_DETAILS_HELP` | `OTHER_DETAILS_PROMPT` |
| Confirmation screen | `WEB_CONFIRM_TITLE` / `WEB_CONFIRM_BODY` | — |
| Expired screen | `WEB_EXPIRED_TITLE` / `WEB_EXPIRED_BODY` | — |
| Already-submitted screen | `WEB_ALREADY_TITLE` / `WEB_ALREADY_BODY` | — |
| Duplicate-date screen | `WEB_DUPLICATE_TITLE` / `WEB_DUPLICATE_BODY` | — |

Variables (`{{firstName}}`, `{{dateRange}}`, etc.) are shared — same `buildVars()` output feeds both sets.

---

## 5. **[REVISED]** Token security — 2 hour expiry

- **Generation:** `crypto.randomBytes(32)` → base64url (43 chars, 256 bits). Contains no employee ID, phone, or any derivable data.
- **Storage:** raw token is **never stored**. Only `SHA-256(token)` in `tokenHash`, unique-indexed. A full DB leak yields no usable links.
- **Lookup:** hash the inbound param, match on the unique index. O(1).
- **Expiration: 2 hours**, fixed (not sliding). Expired links direct the employee to text in again for a fresh one.
- **Single-use:** enforced by atomic compare-and-swap, see §6.
- **No PII in the URL** — the token is opaque; resolution is server-side only.
- **Stated tradeoff:** possession of the link is the authorization model; there is no login. Anyone holding the link within the 2-hour window can complete that report. This matches password-reset/calendar-invite norms and is the accepted cost of a no-login flow.

---

## 6. **[REVISED]** Atomic concurrency protection

Indexes alone are insufficient; both paths use database-level guarantees.

### 6a. One active token per employee
Postgres **partial unique index** (written as raw SQL in the migration — Prisma's schema DSL cannot express partial indexes):

```sql
CREATE UNIQUE INDEX report_tokens_one_active_per_employee
  ON report_tokens (employee_id)
  WHERE status = 'active';
```

Token creation is wrapped so that a unique-violation (`P2002`) from two simultaneous inbound texts is caught and resolved by re-reading the winning row and returning **that** token. Both racing requests therefore send the *same* link. No possibility of two active tokens.

### 6b. No duplicate absences
Two layers:

1. **Compare-and-swap on the token** — finalize begins with a conditional update:
   ```js
   const claimed = await tx.reportToken.updateMany({
     where: { id, status: 'active' },
     data:  { status: 'submitting' },
   });
   if (claimed.count !== 1) { /* another request already claimed it — return existing result */ }
   ```
   `updateMany` with a status predicate compiles to a single `UPDATE ... WHERE status='active'`, which Postgres serialises per row. Exactly one concurrent request can observe `count === 1`.

2. **Unique index on the absence itself** — the real backstop, protecting against duplicates from *any* source, including the legacy SMS flow:
   ```sql
   CREATE UNIQUE INDEX absences_employee_shift_date_key
     ON absences (employee_id, shift_date);
   ```
   Verified safe: production currently has 7 absence rows and **zero** `(employee_id, shift_date)` duplicates.

   `logAbsence()` catches `P2002` on this index and returns `{ duplicate: true }` rather than throwing — closing the read-then-write race that the existing `findFirst` check cannot cover on its own.

All of finalize (claim → create absence → link absence to token → mark submitted) runs inside a single `prisma.$transaction`, so a failure at any point rolls the token back to `active` and the employee can retry.

---

## 7. **[REVISED]** No review screen

The flow ends at the last question. Answering it **is** the submission — there is no separate review or confirm step.

```
CONFIRM_DATE → SELECT_REASON → [MULTI_DAY_PROMPT → RETURN_DATE_PROMPT] → {
  SICK  → SICK_NOTE_PROMPT     → finalize
  EMERG → FAMILY_DETAILS → FAMILY_PROOF_PROMPT → finalize
  LATE  → LATE_ARRIVAL_TIME    → finalize        (never sees multi-day, as today)
  OTHER → OTHER_DETAILS        → finalize
} → SUBMITTED (confirmation screen)
```

Optional steps are skipped exactly as the corresponding `WorkflowSetting` toggles dictate, so e.g. with `dr_note_prompt_enabled = false`, answering the reason question finalizes immediately.

- `POST /api/report/:token/answer` saves the answer, computes the next state, and **if that state is terminal, finalizes within the same request** and returns the confirmation payload.
- Finalize is idempotent: a double-tap or retried request returns the original result rather than erroring or duplicating.
- **Back button** remains available on every question via `stateHistory`; it is naturally unavailable after submission (the flow is complete).

---

## 8. **[REVISED]** Confirmation: web is authoritative, SMS is configurable

- **The web confirmation screen is authoritative** — rendered from `WEB_CONFIRM_TITLE` / `WEB_CONFIRM_BODY`, shown immediately on successful finalize. This is what the employee is told to rely on.
- **A confirmation SMS is also sent, for the employee's records**, and is fully configurable:
  - `confirm_sms_enabled` (workflow setting, default `'true'`) — turns the confirmation text on/off entirely.
  - Content comes from a dedicated, per-reason web-flow template set, independent of both the SMS conversational templates and the web screen copy: `CONFIRM_SMS_SICK_NOTE`, `CONFIRM_SMS_SICK_NO_NOTE`, `CONFIRM_SMS_EMERG_PROOF`, `CONFIRM_SMS_EMERG_NO_PROOF`, `CONFIRM_SMS_LATE`, `CONFIRM_SMS_OTHER`, `CONFIRM_SMS_GENERIC`.
  - Sent via `twilioClient.messages.create()` from the finalize handler (server-initiated, since there is no inbound webhook at that moment).
  - **Send failure never fails the report.** It is fire-and-forget with error logging; the absence is already committed and the web screen has already confirmed it.
- **Manager notification** — `notifyManager(absence.id)`, unchanged.

---

## 9. Database changes

```prisma
model ReportToken {
  id           Int       @id @default(autoincrement())
  tokenHash    String    @unique @map("token_hash")
  employeeId   Int       @map("employee_id")
  state        String    @default("CONFIRM_DATE")
  context      Json      @default("{}")
  stateHistory String[]  @default([]) @map("state_history")
  status       String    @default("active")   // active | submitting | submitted | expired | duplicate
  absenceId    Int?      @map("absence_id")
  expiresAt    DateTime  @map("expires_at")
  submittedAt  DateTime? @map("submitted_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  employee Employee @relation(fields: [employeeId], references: [id])
  absence  Absence? @relation(fields: [absenceId], references: [id])

  @@index([employeeId, status])
  @@map("report_tokens")
}
```

Plus two reverse relations (`Employee.reportTokens`, `Absence.reportToken`) and the two raw-SQL unique indexes from §6.

**Audit trail:** reuses the existing `AuditLog` table — one row per answer and per submission (`action: 'report_step' | 'report_submitted'`, `entityType: 'ReportToken'`).

---

## 10. Route structure

**Backend** — `apps/api/src/routes/report.js`, mounted **before** `app.use('/api', requireAuth(), withAppUser)`:

```
GET  /api/report/:token          → { status, state, screen, context, employee, expiresAt }
POST /api/report/:token/answer   → saves answer; finalizes if terminal
POST /api/report/:token/back     → pops stateHistory, returns previous screen
```

No `/submit` route — §7 removed the review screen, so finalize is triggered by the final answer.

`status` is explicit (`active | submitted | expired | not_found | duplicate`) so the client renders the right screen without inferring from HTTP codes.

**Frontend** — `App.jsx` restructured:

```jsx
<BrowserRouter>
  <Routes>
    <Route path="/r/:token" element={<ReportFlow />} />  {/* public, zero Clerk */}
    <Route path="/*" element={<AuthedApp />} />          {/* existing app, moved as-is */}
  </Routes>
</BrowserRouter>
```

`ReportFlow` imports no Clerk code and uses its own fetch helper. No `Layout`, no header, logo, menu, or nav.

---

## 11. Edge cases

- **Simultaneous inbound texts** → partial unique index + `P2002` recovery; both receive the same link (§6a).
- **Simultaneous submits / double-tap** → CAS claim + absence unique index; one absence, both get the same result (§6b).
- **Existing active token** → resend the same link, preserve progress, never reset.
- **Expired mid-fill** → `status: 'expired'`, clear "text us again" screen.
- **Duplicate date** → `logAbsence()` returns `{ duplicate: true }` (now also via `P2002`); token marked `duplicate`; dedicated screen instead of a false success. **This also fixes the pre-existing bug** where the current SMS flow silently reports success for a duplicate.
- **Different device than the one texted** → works by design (§5 tradeoff).
- **Timezone** — date bounds use the employee's *location* timezone via `employeeTz()`, never the browser's.
- **Return date ≤ shift date** → date-picker `min` for UX **and** server-side re-validation.
- **SMS-bomb abuse** → cap of 5 new tokens per employee per rolling hour on the mint path.
- **Unrecognized phone / STOP** → unchanged.
- **Confirmation SMS failure** → logged, never blocks the report (§8).

---

## 12. File impact

**New:**
- `apps/api/src/workflow/absenceWorkflow.js`
- `apps/api/src/lib/reportToken.js`
- `apps/api/src/routes/report.js`
- `apps/api/prisma/migrations/*_report_tokens/migration.sql`
- `apps/dashboard/src/pages/report/` — `ReportFlow.jsx`, step components, `reportApi.js`
- `apps/dashboard/src/pages/report/report.css` (or Tailwind-only)

**Modified:**
- `apps/api/src/sms/handler.js` — flag branch only; existing logic untouched
- `apps/api/src/services/settingsCache.js` — new template/setting defaults
- `apps/api/src/index.js` — mount report router
- `apps/api/prisma/schema.prisma`
- `apps/dashboard/src/App.jsx`

**Untouched:** every other dashboard page/component, `notify.js`, all existing API routes, `appUser.js`, `businessDate.js`, `session.js`, `ai.js`, and the whole existing conversational SMS path.

---

## 13. Implementation notes — changes made while building

Five things surfaced during implementation that were not in the approved design. All are additions or fixes, none change the agreed behaviour.

**a. Clerk middleware scoped to the dashboard API.** `clerkMiddleware()` was applied to *every* request, so the Twilio webhook, the public report page and its static assets all depended on Clerk being reachable. A Clerk outage or a key rotation would have stopped absence reporting entirely. It now runs only for authenticated `/api/*` routes — the only place `getAuth`/`requireAuth` are used. Found because a placeholder key made the public report page return 500.

**b. Repeat-text dedupe window (`report_link_dedupe_seconds`, default 60s).** Because only the token *hash* is stored, a repeat text cannot resend the same URL — it has to mint a new token and expire the old one. Two texts moments apart therefore delivered two texts and silently killed the first link. Carrier-duplicated messages hit this routinely. Within the window a repeat text is now ignored and the existing link stands.

**c. Date formatting bug fixed in the new module.** Absence dates are `@db.Date` stored at UTC midnight, but were formatted with `toLocaleDateString` and no `timeZone`, rendering in the server's local zone. Every date shifted back a day anywhere west of UTC. This is latent in the **legacy** `handler.js` too — it is masked only because the droplet runs UTC, and would surface the moment the server timezone changed. The new module pins `timeZone: 'UTC'`; the legacy copy was deliberately left alone to keep the old path byte-for-byte unchanged. **Worth fixing separately.**

**d. Settings page could not reach the new templates.** `TEMPLATE_GROUPS` is an explicit allow-list, so any key not named there is invisible. The new `WEB_*`, `LINK_*` and `CONFIRM_SMS_*` templates now live under a dedicated **Web Form** tab, keeping them visibly separate from SMS copy. The same gap explains why `LATE_ARRIVAL_TIME_PROMPT` and `LATE_DONE` were the only two templates never customized — they were never listed, so they could not be edited. Both are now included.

**e. New workflow settings seeded by the migration.** The Workflow tab lists rows from `workflow_settings`, so defaults living only in code would never have appeared. The migration inserts all five rows (`ON CONFLICT DO NOTHING`) with `web_report_flow_enabled = false`, so applying the migration alone changes nothing.

### Verification performed

- **31 unit tests** — state transitions, server-side validation, token generation/hashing.
- **47 end-to-end checks** against a real Postgres (`test/e2e/reportFlow.e2e.js`, needs a throwaway DB; not part of `npm test`) — full flow, Back, refresh-resume, answer-change-after-Back, duplicate dates, expiry, unknown tokens, rate limiting, token secrecy, and both concurrency guarantees under genuinely parallel requests.
- **Real browser, mobile viewport (375×812)** — walked the complete sick/multi-day/doctor's-note path, exercised Back, reloaded mid-flow to confirm progress persisted, submitted, and confirmed the absence, token linkage, audit trail and SMS rows in the database. Confirmed the dashboard still routes correctly after the `App.jsx` restructure.
- **Not visually verified:** the new Settings → Web Form tab (it sits behind Clerk login). It compiles and mirrors the existing tab's rendering, but should be eyeballed once deployed.

### Still required before go-live

1. Run `npx prisma migrate deploy` on the server (adds the table, indexes and settings rows; behaviour unchanged while the flag is off).
2. Set `PUBLIC_BASE_URL` (or rely on the existing `API_BASE_URL`) so links are built as `https://teamnotifi.com/r/…`.
3. Flip `web_report_flow_enabled` to `true` in Settings → Workflow when ready. No redeploy; flip back to roll back.
