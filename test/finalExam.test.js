import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import request from "supertest";

import { createApp } from "../src/app.js";
import { Resident } from "../src/models/Resident.js";
import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { ResidentValidator } from "../src/services/ResidentValidator.js";
import ResidentRegistrationService from "../src/services/ResidentRegistrationService.js";
import ResidentDeactivationService from "../src/services/ResidentDeactivationService.js";
import { ServiceRequestValidator } from "../src/services/ServiceRequestValidator.js";
import ServiceRequestSubmissionService from "../src/services/ServiceRequestSubmissionService.js";
import ServiceRequestStatusService from "../src/services/ServiceRequestStatusService.js";
import ServiceRequestQueryService from "../src/services/ServiceRequestQueryService.js";
import DashboardService from "../src/services/DashboardService.js";
import { applicationConfig } from "../src/config/application.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTempDb() {
    return path.join(os.tmpdir(), `csms-t16-${crypto.randomUUID()}.sqlite`);
}

function removeDb(dbPath) {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

function createTestApp(dbPath) {
    process.env.CSMS_DB_PATH = dbPath;
    return createApp();
}

// ─── Release Version Verification ───────────────────────────────────────────

test("health endpoint reports CSMS v1.0.0 as the release version", async () => {
    const app = createTestApp(createTempDb());
    const res = await request(app).get("/health");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.version, "1.0.0");
    assert.equal(res.body.application, "Community Services Management System");
    assert.equal(res.body.status, "ok");
});

// ─── Final Examination Integration Test ─────────────────────────────────────

test("complete Resident lifecycle and Service Request workflow are reflected accurately in Dashboard aggregates", async () => {
    const dbPath = createTempDb();
    try {
        // ── Setup ─────────────────────────────────────────────────────────
        const resRepo  = new ResidentRepository(dbPath);
        const srRepo   = new ServiceRequestRepository(dbPath);
        const validator      = new ResidentValidator();
        const srValidator    = new ServiceRequestValidator();
        const regService     = new ResidentRegistrationService(validator, resRepo);
        const deactService   = new ResidentDeactivationService(resRepo);
        const submitService  = new ServiceRequestSubmissionService(srValidator, resRepo, srRepo);
        const statusService  = new ServiceRequestStatusService(srRepo);
        const queryService   = new ServiceRequestQueryService(srRepo);
        const dashService    = new DashboardService(resRepo, srRepo);

        // ── T04: Register two Active Residents ────────────────────────────
        const r1 = new Resident({
            firstName: "Juan", lastName: "Cruz",
            address: "Barangay Santo Tomas",
            contactNumber: "09171234561",
            email: "juan@example.com"
        });
        const r2 = new Resident({
            firstName: "Maria", lastName: "Santos",
            address: "Barangay Uno",
            contactNumber: "09171234562",
            email: "maria@example.com"
        });
        regService.registerResident(r1);
        regService.registerResident(r2);

        // ── T09: Submit Service Requests ──────────────────────────────────
        const sr1Result = submitService.submitRequest(new ServiceRequest({
            residentId: r1.id,
            serviceType: "Barangay Clearance",
            description: "Employment requirement",
            dateRequested: "2026-09-01"
        }));
        const sr2Result = submitService.submitRequest(new ServiceRequest({
            residentId: r2.id,
            serviceType: "Certificate Request",
            description: "School enrollment",
            dateRequested: "2026-09-02"
        }));

        assert.equal(sr1Result.success, true);
        assert.equal(sr2Result.success, true);

        // ── T10: Move sr1 through the full workflow ────────────────────────
        statusService.manageStatus(sr1Result.serviceRequest.id, "In Progress");
        statusService.manageStatus(sr1Result.serviceRequest.id, "Completed");

        // ── T07: Deactivate r2 ────────────────────────────────────────────
        deactService.deactivateResident(r2.id);

        // ── T07 + T09: Inactive Resident cannot submit ────────────────────
        const blockedResult = submitService.submitRequest(new ServiceRequest({
            residentId: r2.id,
            serviceType: "Community Assistance",
            description: "Medical support",
            dateRequested: "2026-09-03"
        }));
        assert.equal(blockedResult.success,         false);
        assert.equal(blockedResult.residentInactive, true);

        // ── T11: sr2 still appears in search after r2 deactivated ─────────
        const searchResult = queryService.searchServiceRequests("Certificate");
        assert.equal(searchResult.results.length, 1);
        assert.equal(searchResult.results[0].id, sr2Result.serviceRequest.id);

        // ── T14: Dashboard aggregates reflect all operations ──────────────
        const summary = dashService.getDashboardSummary();

        // Residents
        assert.equal(summary.residents.total,    2);
        assert.equal(summary.residents.active,   1);
        assert.equal(summary.residents.inactive, 1);

        // Service Requests — only 2 were successfully submitted
        assert.equal(summary.serviceRequests.total,     2);
        assert.equal(summary.serviceRequests.completed, 1);
        assert.equal(summary.serviceRequests.pending,   1);
        assert.equal(summary.serviceRequests.open,      1); // sr2 still Pending

        // Recent requests
        assert.equal(summary.recentServiceRequests.length, 2);

        resRepo.close();
        srRepo.close();
    } finally {
        removeDb(dbPath);
    }
});
