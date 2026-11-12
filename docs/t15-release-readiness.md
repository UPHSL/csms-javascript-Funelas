# T15 Release Readiness

## Section 1 - Developer Information

Name: Allan John Funelas
GitHub Username: Funelas
Technology Stack: JavaScript (Node.js, Express.js, SQLite)
T15 Branch: feature/t15-system-hardening

## Section 2 - Release Candidate Baseline

Before T15 hardening, the following were verified:

| Item | Status |
|---|---|
| Application startup | PASS |
| /health | PASS |
| Dashboard | PASS |
| Resident Management | PASS |
| Service Request Management | PASS |
| Starter through T14 automated tests | PASS — 160 tests, 0 failed |

## Section 3 - Hardening Changes

| Area | Issue or Risk Found | Action Taken | Files Changed | Test/Evidence |
|---|---|---|---|---|
| Invalid Input | `Number("abc")` on route IDs returns `NaN` — coincidentally safe but not explicitly guarded | Added `parseId()` helper to both controllers; returns `null` for non-positive-integer input, renders 404 response | `residentController.js`, `serviceRequestController.js` | T15 Category 1 test |
| Persistence Integrity | Partial field update risk if only some fields fail validation | Verified atomic behavior — confirmed T06 rejects the entire update if any field is invalid | No code change needed | T15 Category 2 test |
| Read-Only Safety | Dashboard GET could theoretically mutate state if service layer misbehaved | Verified five consecutive dashboard GET requests leave all persisted data unchanged | No code change needed | T15 Category 3 test |
| Cross-Feature Regression | Resident deactivation must block Service Request submission AND update Dashboard counts | Reviewed and confirmed T07 + T09 + T14 integration is intact | No code change needed | T15 Category 4 test |
| Repeatability | Terminal Service Request status must resist repeated invalid transition attempts | Verified Completed and Cancelled states are immovable across multiple attempts | No code change needed | T15 Category 5 test |
| Repository Hygiene | `csms.sqlite` runtime database | Confirmed `*.sqlite` is in `.gitignore` | `.gitignore` | Reviewed |
| Navigation | Nav links across all views | Verified Dashboard, Residents, Service Requests links work across all pages | No change needed | Manual verification |

## Section 4 - Five New T15 Hardening Tests

**Test 1**
Test Name: `T15 | malformed Resident ID in URL is handled safely without crash`
Category: Invalid or Malformed Input
What It Verifies: A non-numeric string such as `abc` in `/residents/abc/edit` returns a controlled 404 response without crashing, exposing a stack trace, or creating any database records.
Why It Adds Value: No existing test sends a malformed string as a route ID. Previous tests only use valid integer IDs or known-missing integer IDs like `999999`.

**Test 2**
Test Name: `T15 | invalid Resident update does not partially modify persisted fields`
Category: Rejected Mutation Protects Persistence
What It Verifies: When a Resident update contains a mix of valid fields and one invalid field (bad contact number), the entire update is rejected and all original field values remain unchanged in persistence.
Why It Adds Value: Existing T06 tests verify that an invalid update fails. This test specifically verifies that fields which were individually valid are not partially written — proving atomic rejection behavior at the integration level.

**Test 3**
Test Name: `T15 | repeated dashboard GET requests do not modify any persisted data`
Category: Read-Only Request Safety
What It Verifies: Five consecutive GET requests to `/dashboard` leave Resident count, Service Request count, and individual Service Request status all unchanged in persistence.
Why It Adds Value: The T14 test checks a single GET. This test verifies repeated access, which is the realistic scenario for a monitoring dashboard.

**Test 4**
Test Name: `T15 | deactivating a Resident prevents new Service Request submission and updates dashboard`
Category: Cross-Feature Regression
What It Verifies: After a Resident is deactivated via T07, a Service Request submission attempt for that Resident is rejected by T09, and the Dashboard (T14) reflects the updated Active/Inactive counts.
Why It Adds Value: Crosses three ticket boundaries (T07, T09, T14) in a single scenario. No existing test combines all three in one flow.

**Test 5**
Test Name: `T15 | terminal Service Request cannot be transitioned even after repeated attempts`
Category: Repeatability / Boundary Behavior
What It Verifies: A Completed Service Request survives three consecutive invalid transition attempts (to Pending, In Progress, and Cancelled) and remains Completed with all other fields unchanged.
Why It Adds Value: Existing T10 terminal tests each attempt one invalid transition. This test verifies the terminal state holds under repeated pressure, confirming there is no cumulative state corruption.

## Section 5 - Full Regression Test Results

Test command: `npm test`

Run 1: 165 tests, 0 failed
Run 2: 165 tests, 0 failed

## Section 6 - Manual Release Verification

| Verification | Result | Notes |
|---|---|---|
| Application starts | PASS | |
| /health works | PASS | |
| Dashboard loads | PASS | |
| Resident listing/search works | PASS | |
| Valid Resident registration works | PASS | |
| Invalid Resident registration is rejected | PASS | |
| Resident update works | PASS | |
| Resident deactivation works and record remains visible | PASS | |
| Valid Service Request submission for Active Resident works | PASS | |
| Missing/Inactive Resident submission is rejected | PASS | |
| Service Request search/filter/details work | PASS | |
| Valid Service Request workflow works | PASS | |
| Invalid/terminal transition is rejected | PASS | |
| Dashboard reflects Resident/Service Request changes | PASS | |
| Read-only GET operations do not modify persistence | PASS | |

## Section 7 - Repository Hygiene Review

| Item | Status |
|---|---|
| Debug output | None found |
| Temporary files | None found |
| Generated build/runtime artifacts | None found |
| Accidental local database files | `csms.sqlite` excluded via `*.sqlite` in `.gitignore` |
| Commented-out abandoned code | None found |
| Secrets/credentials | None found |
| Broken navigation/links | None found |
| Direct SQL parameter binding | All SQL uses `?` parameterized statements throughout T03–T14 |

## Section 8 - Known Limitations

No known release-blocking limitations identified within the defined CSMS scope.

The following are noted as future improvement opportunities outside T01–T15 requirements:

- No pagination for large Resident or Service Request lists
- No authentication or authorization
- Resident search covers only first and last name, not email or contact number
- No Resident reactivation capability
- No Service Request edit after submission

## Section 9 - Release Candidate Statement

READY FOR T16 FINAL EXAM
