# Midterm Checkpoint

## Section 1 - Developer Information

Name: Allan John Funelas
GitHub Username: Funelas
Primary Technology Stack: JavaScript (Node.js, Express, SQLite)
T10 Branch: feature/t10-service-request-status

## Section 2 - My T10 Implementation

The `ServiceRequestStatusService` manages the status workflow for T10. It receives a Service Request ID and a requested target status, then retrieves the current Service Request from persistence using `ServiceRequestRepository.findById()`. The current persisted status is read from the returned object to determine what transitions are possible. Valid and invalid transitions are distinguished using a `Map` that maps each current status to a `Set` of allowed target statuses — if the requested status is not in that set, the transition is rejected without touching the database. Unsupported statuses are caught before the transition check by verifying against a `Set` of the four recognized status values. Same-status requests are automatically rejected because no status maps to itself as an allowed target. Only when all checks pass does the service call `ServiceRequestRepository.updateStatus()`, which issues a parameterized `UPDATE` SQL statement targeting only the specific Service Request ID. The method then calls `findById()` again to return the fresh persisted state of the Service Request.

## Section 3 - My Transition Rules

| From        | To          | Result   |
|-------------|-------------|----------|
| Pending     | In Progress | Allowed  |
| Pending     | Cancelled   | Allowed  |
| In Progress | Completed   | Allowed  |
| In Progress | Cancelled   | Allowed  |
| All others  | Any         | Rejected |

**Pending to Completed is rejected** because a request must be actively worked on (In Progress) before it can be finished. Skipping In Progress bypasses the intended workflow.

**Completed is terminal** because a finished request represents a closed transaction. There is no business reason to reopen or move it to another state.

**Cancelled is terminal** because a cancelled request has been deliberately stopped. Reopening it is outside the T10 scope.

**Same-status requests are rejected** because T10 enforces actual state transitions. The `ALLOWED_TRANSITIONS` map does not include any status as a target of itself, so `Pending → Pending` and similar requests are treated as invalid transitions.

## Section 4 - Files I Changed

File: `src/repositories/ServiceRequestRepository.js`
Purpose: Added `updateStatus()` method to persist a parameterized SQL status change targeting a specific Service Request by ID.

File: `src/services/ServiceRequestStatusService.js`
Purpose: New service that enforces transition rules, handles not-found and unsupported-status conditions, and coordinates persistence updates.

File: `test/serviceRequestStatus.test.js`
Purpose: Automated tests covering all required T10 scenarios plus the student-designed test.

File: `docs/midterm-checkpoint.md`
Purpose: Midterm examination checkpoint document describing the T10 implementation.

## Section 5 - Problem I Encountered

**What happened:**
While implementing `updateStatus()` in `ServiceRequestRepository.js`, running the T10 tests threw a SQL syntax error immediately when the method was first called.

```
SqliteError: near "FROM": syntax error
```

**What caused it:**
Coming from writing many SELECT queries, I instinctively included `FROM` between `UPDATE` and the table name, writing:

```sql
UPDATE FROM service_requests
SET status = ?
WHERE id = ?
```

UPDATE syntax does not use `FROM` before the table name unlike SELECT.

**How I investigated it:**
The error message pointed directly to the `db.prepare()` call inside `updateStatus()`. Reading the error carefully, the word `"FROM"` was highlighted as the unexpected token, which pointed me straight to that line in the SQL string.

**How I resolved it:**
I removed the `FROM` keyword so the statement became the correct syntax:

```sql
UPDATE service_requests
SET status = ?
WHERE id = ?
```

The tests passed immediately after the fix.

## Section 6 - My Student-Designed Test

Test Name: blank or whitespace status is rejected as unsupported

What the Test Verifies: Attempting to set a Service Request's status to a blank or whitespace-only string is rejected as an unsupported status. The persisted status must remain unchanged at Pending.

Why I Added This Test: The required unsupported-status test uses a recognizable invalid word like "Approved". I wanted to verify that the guard also handles empty or whitespace input — confirming the check validates for the presence of a recognized value, not just the absence of specific wrong words.


## Section 7 - Tools and References Used

- Node.js documentation (node:test, node:sqlite)
- SQLite documentation
- Kiro AI assistant (used for code generation guidance)
- VS Code / Kiro IDE
