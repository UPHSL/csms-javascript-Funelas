# Final Development Checkpoint

## 1. Developer Information

Name: Allan John Funelas
GitHub Username: Funelas
Technology Stack: JavaScript (Node.js, Express.js, SQLite)
T16 Branch: feature/t16-final-release
Final Release Version: 1.0.0

## 2. My Final Release Implementation

The release version is established in `src/config/application.js` as the `version` field inside the `applicationConfig` object, which is the existing single source of truth for all application-level configuration. This location was chosen because it was already used by the health controller and home page controller since the starter template, making it the natural home for release metadata. The `/health` endpoint obtains the version by importing `applicationConfig` and reading `applicationConfig.version` directly — no additional logic was needed. The browser interface displays the version as `v1.0.0` in the shared navigation partial `src/views/partials/nav.ejs`, which is included across all pages, ensuring consistent version visibility without duplicating the string in individual templates. Inconsistent version values are avoided because the nav partial hardcodes `v1.0.0` as a display label while the actual machine-readable version lives only in `applicationConfig` — the two serve different purposes and do not conflict. This approach follows the Express.js convention of centralizing application configuration in a dedicated config module rather than scattering metadata across controllers or templates.

## 3. Files I Changed

File: `src/config/application.js`
Purpose: Updated `version` from `0.1.0` to `1.0.0` and `currentSprint` to `Sprint 6 - Final Release` — the authoritative release version source used by /health and the home page.

File: `src/views/partials/nav.ejs`
Purpose: Added `v1.0.0` version label to the shared navigation bar, making the release version visible across all browser pages.

File: `test/application.test.js`
Purpose: Updated existing starter test assertions from `0.1.0` to `1.0.0` to reflect the final release version.

File: `test/finalExam.test.js`
Purpose: New final examination integration test and release-version verification test.

File: `docs/release-v1.0.0.md`
Purpose: Official CSMS v1.0.0 release notes.

File: `docs/final-checkpoint.md`
Purpose: Final examination checkpoint document.

## 4. My Final Examination Test

Test Name: complete Resident lifecycle and Service Request workflow are reflected accurately in Dashboard aggregates

Modules/Responsibilities Covered: T04 Resident Registration, T07 Resident Deactivation, T09 Service Request Submission and Eligibility, T10 Service Request Status Transitions, T11 Service Request Search, T14 Dashboard Aggregation

Starting State: Empty database with no Residents or Service Requests

Operations Performed:
1. Register two Active Residents (T04)
2. Submit one Service Request for each Resident (T09)
3. Move the first Service Request through Pending → In Progress → Completed (T10)
4. Deactivate the second Resident (T07)
5. Attempt to submit another Service Request for the now-Inactive Resident — must fail (T07 + T09)
6. Search for the second Resident's Service Request by service type (T11)
7. Read Dashboard aggregates and verify all counts reflect the operations above (T14)

Expected Final State: 2 total Residents (1 Active, 1 Inactive), 2 total Service Requests (1 Completed, 1 Pending), 1 open request, blocked submission attempt returns residentInactive, search returns the pending request, dashboard counts match exactly

Why This Test Is Meaningful: No single existing test combines Resident deactivation with Service Request eligibility checking, completed workflow transitions, search retrieval, and Dashboard aggregate accuracy in one flow. This test proves the system works as an integrated application rather than as isolated modules.

## 5. My Final Technical Decision

Decision: Display the release version as a hardcoded `v1.0.0` string in the nav partial rather than passing it from the controller via template data.

Alternative Considered: Passing `applicationConfig.version` from every controller to every view template so the nav partial could display a dynamic version variable.

Reason for My Decision: The release version changes only during a deliberate release event, not at runtime. Passing it dynamically through every controller would require updating all six controllers and introducing a version variable dependency into every template render call — adding complexity with no practical benefit. A hardcoded display label in the nav partial is simpler, honest about its purpose, and consistent with how the nav already hardcodes the brand name `CSMS`. The machine-readable version in `applicationConfig` remains the authoritative value for /health and automated verification.

## 6. Problem or Verification Issue Encountered

Problem: After updating `version` to `1.0.0` in `applicationConfig`, the existing starter test `"health endpoint returns the expected payload"` immediately failed because it asserted `version: "0.1.0"` with `assert.deepEqual`.

Cause or Investigation: The test used an exact deep equality check against the full `/health` response body including the version string. When `applicationConfig.version` was changed, the test correctly detected the mismatch — which is the intended behavior of that test.

Resolution: Updated the two version assertions in `test/application.test.js` to expect `"1.0.0"` and updated the sprint text assertion to match the new `currentSprint` value. This confirms the single source of truth is working correctly — one config change caused the test to detect the update and required intentional test maintenance.

## 7. Final Regression Results

Test Command: `npm test`

Final Regression Run 1: 167 pass, 0 fail
Final Regression Run 2: 167 pass, 0 fail
Total Passing Tests Reported: 167

## 8. Tools and References Used

- Node.js documentation (node:test, node:sqlite)
- Express.js documentation
- SQLite documentation
- Kiro AI assistant (used for implementation guidance throughout T01-T16)
- VS Code / Kiro IDE
- GitHub documentation (releases, tags)

## 9. Final Release Declaration

CSMS v1.0.0 - READY FOR RELEASE
