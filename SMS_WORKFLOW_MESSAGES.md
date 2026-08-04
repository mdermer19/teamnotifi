# TeamNotifi — Complete SMS Workflow Message Reference

This document lists every text message the system can send, in the order an employee would encounter them, including the manager notification. Text shown is the **current live text** (pulled directly from the database as of this document's generation — editable on the Settings page). Two messages are still on their factory default (never edited): `LATE_ARRIVAL_TIME_PROMPT` and `LATE_DONE`, noted below.

Variable placeholders use `{{variableName}}` syntax and are filled in automatically when the message is sent.

---

## Variable Reference

| Variable | Description | Where it comes from |
|---|---|---|
| `{{firstName}}` | Employee's first name | Employee record |
| `{{lastName}}` | Employee's last name | Employee record |
| `{{locationName}}` | Employee's assigned location name | Employee's location record |
| `{{shiftDate}}` | The first day of the absence, formatted like "Aug 4" | Date the employee reported for |
| `{{dateRange}}` | Full absence date range, e.g. "Aug 4" (single day) or "Aug 4 – Aug 5" (multi-day) | Calculated from shift date + return date |
| `{{returnDate}}` | The date the employee expects to return to work, formatted like "Aug 6" | Only set if the employee reported a multi-day absence |
| `{{reason}}` | The absence reason label (e.g. "I'm Sick") | Looked up from the selected reason code |
| `{{original}}` | *(Not currently used — see note below)* | N/A |
| `{{date}}` | *(Not currently used — see note below)* | N/A |

**Note:** Two templates — `REPROMPT` and `DUPLICATE_ABSENCE` — exist in the system and can be edited on the Settings page, but **are not currently wired into any code path**. They are never sent to an employee today. See "Defined but unused" section at the bottom.

---

## 1. First Contact / Identification

### Unrecognized phone number
**Sent when:** An employee texts in from a phone number that isn't on file, and their message isn't a valid Employee ID.
**Template key:** `UNKNOWN_PHONE`
**Variables used:** none

> We don't recognize this number. Reply with your Employee ID to get set up.

*(If they then reply with a valid Employee ID, they proceed to the next message and that phone number becomes permanently linked to their record. If not on other flows, this repeats.)*

---

## 2. Confirm Start

**Sent when:** The employee is identified (phone number matched, or valid Employee ID entered).
**Template key:** `CONFIRM_START`
**Variables used:** `{{firstName}}`

> Hi {{firstName}}, if you are reporting an absence or late arrival, reply YES. Call out is not complete until you see "DONE." Type CANCEL to stop.

- Reply **YES** → proceeds to "What date are you reporting for?"
- Reply **NO** or **CANCEL** → sends the Cancel message (§9) and ends the session
- Anything else → this message repeats

---

## 3. Confirm Date

**Sent when:** Employee confirms they want to report an absence.
**Template key:** `CONFIRM_DATE`
**Variables used:** none

> What date are you reporting for? Reply TODAY, TOMORROW, or a date (e.g. 06/20).

- Valid date (TODAY, TOMORROW, or MM/DD, including natural language like "Monday" via AI parsing) → proceeds to Select Reason (§4), *unless* the employee already stated their reason in their very first message (e.g. "I'm sick"), in which case the system skips straight ahead to the appropriate reason flow
- Invalid/unparseable → sends Invalid Date message below and repeats

### Invalid Date
**Template key:** `INVALID_DATE`
**Variables used:** none

> Didn't catch that. Say it a different way. Reply TODAY, TOMORROW, or a date like 06/20.

---

## 4. Select Reason

**Sent when:** A valid date has been provided (and the employee didn't already state a reason up front).
**Template key:** `SELECT_REASON`
**Variables used:** none

> Please select a reason:
> 1 - I'm Sick
> 2 - Family/Personal or Other Emergency
> 3 - Late Arrival
> 4 - Other

- Reply **1, 2, 3, or 4** (or a free-text description the AI can match, e.g. "I have the flu" → 1) → proceeds to that reason's flow below
- If the employee gives descriptive free text instead of a number (e.g. "my grandmother passed away"), that text is saved automatically as their absence notes/details, so they won't be asked to describe it again later
- Reply **CANCEL** → sends Cancel message (§9) and ends session
- Invalid input → sends Invalid Reason message below and repeats

### Invalid Reason
**Template key:** `INVALID_REASON`
**Variables used:** none

> Please reply with a number 1-4.
>
> 1 - I'm Sick
> 2 - Family/Personal or Other Emergency
> 3 - Late Arrival
> 4 - Other

---

## 5. Multi-Day Prompt *(optional — controlled by a workflow toggle)*

**Sent when:** A reason has been selected (Sick, Emergency, or Other — not Late Arrival) and the multi-day prompt setting is enabled.
**Template key:** `MULTI_DAY_PROMPT`
**Variables used:** none

> Do you plan to miss more than one day? Reply YES or NO.

- Reply **NO** → proceeds directly to that reason's next step
- Reply **YES** → proceeds to Return Date Prompt below
- Unclear reply → this message repeats

### Return Date Prompt
**Template key:** `RETURN_DATE_PROMPT`
**Variables used:** none

> What date do you plan to return to work? Reply a date (e.g. 06/22).

- Valid date after the first absent day → proceeds to that reason's next step
- Date is on or before the first absent day → the system prepends a warning ("Your return date must be after your first absent day (MM/DD).") to this same prompt and repeats
- Unparseable date → sends Invalid Return Date message below

### Invalid Return Date
**Template key:** `INVALID_RETURN_DATE`
**Variables used:** none

> Didn't catch that. Please reply with a return date like 06/22.

---

## 6. Reason: I'm Sick

### Doctor's note prompt *(optional — controlled by a workflow toggle)*
**Sent when:** Reason = Sick, and the doctor's-note-prompt setting is enabled.
**Template key:** `SICK_NOTE_PROMPT`
**Variables used:** none

> Will you be getting a doctor's note? Reply YES or NO.

- Reply **YES** → absence is logged, sends "Yes, providing note" confirmation below
- Reply **NO** → absence is logged, sends "No note" confirmation below
- Unclear reply → sends Sick Reprompt below and repeats

### Sick Reprompt
**Template key:** `SICK_REPROMPT`
**Variables used:** none

> I didn't get that. Will you be getting a doctor's note? Reply YES or NO.

### Confirmation — will provide doctor's note
**Template key:** `SICK_YES_NOTE`
**Variables used:** `{{dateRange}}`

> Your absence has been recorded for {{dateRange}}. Provide doctor's note to your manager within 48 hours and you will receive 0 points. Otherwise, the absence is be unexcused and you will receive 2 points per the Attendance Policy. DONE

### Confirmation — will NOT provide doctor's note
**Template key:** `SICK_NO_NOTE`
**Variables used:** `{{dateRange}}`

> We're sorry to hear you're not feeling well. Your absence has been recorded for {{dateRange}}. Since you will not be providing a doctor's note, you will receive 2 points per the Attendance Policy. DONE

### If doctor's-note prompt is disabled
The absence is logged immediately and the generic Absence Confirmed message is sent instead (see §10).

---

## 7. Reason: Family/Personal or Other Emergency

### Details prompt
**Sent when:** Reason = Emergency, and the employee has not already described it in free text earlier in the conversation.
**Template key:** `FAMILY_DETAILS_PROMPT`
**Variables used:** none

> Please provide further details about the nature of your absence.

*(If the employee already described the emergency earlier — e.g. by typing "my friend died" instead of pressing 2 — this prompt is skipped entirely and the system proceeds straight to the acknowledgment + proof prompt below.)*

### Acknowledgment + proof prompt *(sent together as one message)*
**Sent when:** Details have been received (either just now, or earlier in the conversation), and the proof-prompt setting is enabled.
**Template keys:** `FAMILY_DETAILS_ACK` + `FAMILY_PROOF_PROMPT` (concatenated with a blank line between them)
**Variables used:** none

> We are sorry you are dealing with an emergency. Management will determine whether this is an excused absence and whether documentation is required.
>
> Are you able to provide proof of this emergency? This is not required but will help your manager determine if the absence is excused. Reply YES or NO.

- Reply **YES** → absence is logged, sends "Yes, providing proof" confirmation below
- Reply **NO** → absence is logged, sends "No proof" confirmation below
- Unclear reply → sends Family Reprompt below and repeats

### Family Reprompt
**Template key:** `FAMILY_REPROMPT`
**Variables used:** none

> Please reply YES or NO.

### Confirmation — will provide proof
**Template key:** `FAMILY_YES_PROOF`
**Variables used:** `{{dateRange}}`

> Your absence has been recorded for {{dateRange}}. Please send proof to your manager within 48 hours & they will determine whether this is an excused absence. DONE

### Confirmation — will NOT provide proof
**Template key:** `FAMILY_NO_PROOF`
**Variables used:** `{{dateRange}}`

> Your absence has been recorded for {{dateRange}}. Management will determine whether this is an excused absence. DONE

### If proof prompt is disabled
The absence is logged immediately after details are received (or immediately, if details were already known) and the generic Absence Confirmed message is sent instead (see §10).

---

## 8. Reason: Late Arrival

*Note: Late Arrival skips the Multi-Day Prompt entirely — it always goes straight to the arrival-time question.*

### Arrival time prompt — ⚠️ still on factory default, never customized
**Sent when:** Reason = Late Arrival.
**Template key:** `LATE_ARRIVAL_TIME_PROMPT`
**Variables used:** none

> Approximately what time do you expect to arrive?

*(Employee's free-text reply, e.g. "9:15am", is saved as-is and used as the arrival time.)*

### Confirmation — ⚠️ still on factory default, never customized
**Template key:** `LATE_DONE`
**Variables used:** `{{firstName}}`

> Thank you for letting us know, {{firstName}}. Your manager has been notified. If you clock in within 7 minutes of your scheduled start time, you will not receive any points. If you are tardy by more than 7 minutes, you will receive 1 point per the Attendance Policy.

*(There is also a `LATE_MESSAGE` template, shown below, which is currently defined but not directly sent by the SMS handler as of this writing — it duplicates the policy language from `LATE_DONE`.)*

### Late Message *(defined, currently unused by the live SMS flow)*
**Template key:** `LATE_MESSAGE`
**Variables used:** none

> Arrive within 7 minutes of your scheduled start time, no points. More than 7 minutes late, you will receive 1 point per the Attendance Policy. DONE

---

## 9. Reason: Other

### Details prompt
**Sent when:** Reason = Other, and the employee has not already described it in free text earlier in the conversation.
**Template key:** `OTHER_DETAILS_PROMPT`
**Variables used:** none

> Please briefly describe the reason for your absence.

*(If the employee already gave a description earlier in the conversation, this prompt is skipped and the absence is logged immediately using that earlier text.)*

### Confirmation
**Template key:** `OTHER_DONE`
**Variables used:** `{{firstName}}`, `{{dateRange}}`

> Got it, {{firstName}}. Your absence has been recorded for {{dateRange}}. Management will determine whether this is an excused absence. DONE

---

## 10. Generic / Cross-Cutting Messages

### Cancel
**Sent when:** Employee replies NO or CANCEL at the very start (Confirm Start) or at Select Reason.
**Template key:** `CANCEL`
**Variables used:** none

> No problem. Text us anytime.

### Generic Absence Confirmed
**Sent when:** An absence is logged in a flow where the relevant optional prompt (doctor's note, proof) is turned **off** in workflow settings — i.e., this message substitutes for `SICK_YES_NOTE`/`SICK_NO_NOTE`/`FAMILY_YES_PROOF`/`FAMILY_NO_PROOF` when those follow-up questions are disabled.
**Template key:** `ABSENCE_CONFIRMED`
**Variables used:** `{{dateRange}}`

> Your absence has been recorded for {{dateRange}}. Your manager has been notified.

### STOP / QUIT / UNSUBSCRIBE
**Sent when:** Employee texts STOP, QUIT, or UNSUBSCRIBE at any point.
**Result:** No reply is sent at all (Twilio handles the carrier-level opt-out automatically). This is not a customizable template — it's hardcoded behavior.

---

## 11. Manager Notification (not an employee-facing message)

**Sent when:** An absence is successfully logged, to the employee's manager (or their designated coverage/subscriber chain if the manager is out).
**Not editable on the Settings page** — this text is hardcoded in the notification service, not a database template.
**Variables used (all computed inline, not `{{}}` syntax):** employee first/last name, role, location name, date range, reason label, plus reason-specific detail:
- **Sick:** doctor's note promise status
- **Emergency:** details text (if given) + proof promise status
- **Late:** expected arrival time (if given)
- **Other:** details text (if given)

Example (Sick, no doctor's note):

> TeamNotifi: Jane Smith (Groomer) at Brookhaven reported an absence for Aug 4. Reason: I'm Sick. No doctor's note (2 points). See details in the TeamNotifi dashboard.

Example (Emergency, with details, proof promised):

> TeamNotifi: Jane Smith (Groomer) at Brookhaven reported an absence for Aug 4. Reason: Family/Personal or Other Emergency. Details: my car broke down. Proof promised: yes. See details in the TeamNotifi dashboard.

---

## Defined but currently unused templates

These two templates exist in the system, are editable on the Settings page, and have real DEFAULT text — but nothing in the current SMS handler code ever sends them. Editing them right now would have **no effect** on any live conversation.

### Reprompt *(unused)*
**Template key:** `REPROMPT`
**Variables used:** `{{original}}` *(not populated anywhere since this is never called)*

> Didn't catch that. {{original}}

### Duplicate Absence *(unused)*
**Template key:** `DUPLICATE_ABSENCE`
**Variables used:** `{{date}}` *(not populated anywhere since this is never called)*

> You already reported out for {{date}}. Reply UPDATE to change it or CANCEL to keep the existing report.

**Note on duplicate absences:** The system does detect when an employee tries to report an absence for a date that's already on file (`logAbsence()` returns early without creating a new record). However, none of the calling code checks for this — the employee still receives the normal success/confirmation message as if a new absence were created, even though nothing new was saved. This is a real gap: a second call-out for the same date is silently swallowed rather than flagged to the employee or their manager. Worth fixing if duplicate call-outs are a scenario you care about.

---

## Complete Template Key Index (alphabetical)

| Key | Section | Status |
|---|---|---|
| `ABSENCE_CONFIRMED` | §10 | Live, customized |
| `CANCEL` | §10 | Live, customized |
| `CONFIRM_DATE` | §3 | Live, customized |
| `CONFIRM_START` | §2 | Live, customized |
| `DUPLICATE_ABSENCE` | Unused | Defined, not wired up |
| `FAMILY_DETAILS_ACK` | §7 | Live, customized |
| `FAMILY_DETAILS_PROMPT` | §7 | Live, customized |
| `FAMILY_NO_PROOF` | §7 | Live, customized |
| `FAMILY_PROOF_PROMPT` | §7 | Live, customized |
| `FAMILY_REPROMPT` | §7 | Live, customized |
| `FAMILY_YES_PROOF` | §7 | Live, customized |
| `INVALID_DATE` | §3 | Live, customized |
| `INVALID_REASON` | §4 | Live, customized |
| `INVALID_RETURN_DATE` | §5 | Live, customized |
| `LATE_ARRIVAL_TIME_PROMPT` | §8 | Live, **factory default** |
| `LATE_DONE` | §8 | Live, **factory default** |
| `LATE_MESSAGE` | §8 | Defined, not sent by current flow |
| `MULTI_DAY_PROMPT` | §5 | Live, customized |
| `OTHER_DETAILS_PROMPT` | §9 | Live, customized |
| `OTHER_DONE` | §9 | Live, customized |
| `REPROMPT` | Unused | Defined, not wired up |
| `RETURN_DATE_PROMPT` | §5 | Live, customized |
| `SICK_NOTE_PROMPT` | §6 | Live, customized |
| `SICK_NO_NOTE` | §6 | Live, customized |
| `SICK_REPROMPT` | §6 | Live, customized |
| `SICK_YES_NOTE` | §6 | Live, customized |
| `SELECT_REASON` | §4 | Live, customized |
| `UNKNOWN_PHONE` | §1 | Live, customized |
| *(manager notification)* | §11 | Live, hardcoded (not a Settings-page template) |
