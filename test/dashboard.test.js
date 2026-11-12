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
import DashboardService from "../src/services/DashboardService.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTempDb() {
    return path.join(os.tmpdir(), `csms-t14-${crypto.randomUUID()}.sqlite`);
}

function removeDb(dbPath) {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

function createTestApp(dbPath) {
    process.env.CSMS_DB_PATH = dbPath;
    return createApp();
}

function seedResident(dbPath, overrides = {}) {
    const repo = new ResidentRepository(dbPath);
    const validator = new ResidentValidator();
    const service = new ResidentRegistrationService(validator, repo);
    const resident = new Resident({
        firstName: "Juan", lastName: "Cruz",
        address: "Barangay Santo Tomas",
        contactNumber: "09171234567",
        email: `r-${crypto.randomUUID()}@example.com`,
        status: "Active",
        ...overrides
    });
    service.registerResident(resident);
    repo.close();
    return resident;
}

function seedServiceRequest(dbPath, residentId, overrides = {}) {
    const resRepo = new ResidentRepository(dbPath);
    const srRepo = new ServiceRequestRepository(dbPath);
    const validator = new ServiceRequestValidator();
    const service = new ServiceRequestSubmissionService(validator, resRepo, srRepo);
    const result = service.submitRequest(new ServiceRequest({
        residentId,
        serviceType: "Barangay Clearance",
        description: "Employment requirement",
        dateRequested: "2026-09-30",
        ...overrides
    }));
    resRepo.close();
    srRepo.close();
    return result.serviceRequest;
}

function advanceStatus(dbPath, srId, targetStatus) {
    const srRepo = new ServiceRequestRepository(dbPath);
    const statusService = new ServiceRequestStatusService(srRepo);
    statusService.manageStatus(srId, targetStatus);
    srRepo.close();
}

function createDashboardService(dbPath) {
    const residentRepo = new ResidentRepository(dbPath);
    const srRepo = new ServiceRequestRepository(dbPath);
    return {
        service: new DashboardService(residentRepo, srRepo),
        cleanup: () => { residentRepo.close(); srRepo.close(); }
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("dashboard loads successfully", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app).get("/dashboard");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Dashboard/i);
    } finally { removeDb(dbPath); }
});

test("empty dashboard displays zero counts", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const summary = service.getDashboardSummary();
        assert.equal(summary.residents.total,          0);
        assert.equal(summary.residents.active,         0);
        assert.equal(summary.residents.inactive,       0);
        assert.equal(summary.serviceRequests.total,    0);
        assert.equal(summary.serviceRequests.pending,  0);
        assert.equal(summary.serviceRequests.inProgress, 0);
        assert.equal(summary.serviceRequests.completed, 0);
        assert.equal(summary.serviceRequests.cancelled, 0);
        assert.equal(summary.serviceRequests.open,     0);
        assert.deepEqual(summary.recentServiceRequests, []);
    } finally { cleanup(); removeDb(dbPath); }
});

test("total Resident count is correct", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        seedResident(dbPath);
        seedResident(dbPath);
        seedResident(dbPath);
        const summary = service.getDashboardSummary();
        assert.equal(summary.residents.total, 3);
    } finally { cleanup(); removeDb(dbPath); }
});

test("Resident status counts are correct", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        seedResident(dbPath);
        seedResident(dbPath);
        seedResident(dbPath, { status: "Inactive" });
        const summary = service.getDashboardSummary();
        assert.equal(summary.residents.active,   2);
        assert.equal(summary.residents.inactive, 1);
        assert.equal(
            summary.residents.total,
            summary.residents.active + summary.residents.inactive
        );
    } finally { cleanup(); removeDb(dbPath); }
});

test("total Service Request count is correct", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-01" });
        seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-02" });
        seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-03" });
        const summary = service.getDashboardSummary();
        assert.equal(summary.serviceRequests.total, 3);
    } finally { cleanup(); removeDb(dbPath); }
});

test("Service Request status counts are correct", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        const sr1 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-01" });
        const sr2 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-02" });
        const sr3 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-03" });
        const sr4 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-04" });

        advanceStatus(dbPath, sr2.id, "In Progress");
        advanceStatus(dbPath, sr3.id, "In Progress");
        advanceStatus(dbPath, sr3.id, "Completed");
        advanceStatus(dbPath, sr4.id, "Cancelled");

        const summary = service.getDashboardSummary();
        assert.equal(summary.serviceRequests.pending,    1);
        assert.equal(summary.serviceRequests.inProgress, 1);
        assert.equal(summary.serviceRequests.completed,  1);
        assert.equal(summary.serviceRequests.cancelled,  1);
    } finally { cleanup(); removeDb(dbPath); }
});

test("Service Request counts reconcile", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        const sr1 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-01" });
        const sr2 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-02" });
        advanceStatus(dbPath, sr2.id, "In Progress");

        const summary = service.getDashboardSummary();
        assert.equal(
            summary.serviceRequests.total,
            summary.serviceRequests.pending +
            summary.serviceRequests.inProgress +
            summary.serviceRequests.completed +
            summary.serviceRequests.cancelled
        );
    } finally { cleanup(); removeDb(dbPath); }
});

test("open Service Request count is correct", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        const sr1 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-01" });
        const sr2 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-02" });
        const sr3 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-03" });
        const sr4 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-04" });

        advanceStatus(dbPath, sr2.id, "In Progress");
        advanceStatus(dbPath, sr3.id, "In Progress");
        advanceStatus(dbPath, sr3.id, "Completed");
        advanceStatus(dbPath, sr4.id, "Cancelled");

        const summary = service.getDashboardSummary();
        assert.equal(summary.serviceRequests.open,
            summary.serviceRequests.pending + summary.serviceRequests.inProgress
        );
        assert.equal(summary.serviceRequests.open, 2);
    } finally { cleanup(); removeDb(dbPath); }
});

test("Resident deactivation is reflected on dashboard", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);

        const before = service.getDashboardSummary();
        assert.equal(before.residents.active,   1);
        assert.equal(before.residents.inactive, 0);

        const resRepo = new ResidentRepository(dbPath);
        const deactivationService = new ResidentDeactivationService(resRepo);
        deactivationService.deactivateResident(resident.id);
        resRepo.close();

        const after = service.getDashboardSummary();
        assert.equal(after.residents.total,    before.residents.total);
        assert.equal(after.residents.active,   0);
        assert.equal(after.residents.inactive, 1);
    } finally { cleanup(); removeDb(dbPath); }
});

test("Service Request transition is reflected on dashboard", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);

        const before = service.getDashboardSummary();
        assert.equal(before.serviceRequests.pending,    1);
        assert.equal(before.serviceRequests.inProgress, 0);

        advanceStatus(dbPath, sr.id, "In Progress");

        const after = service.getDashboardSummary();
        assert.equal(after.serviceRequests.pending,    0);
        assert.equal(after.serviceRequests.inProgress, 1);
        assert.equal(after.serviceRequests.total, before.serviceRequests.total);
    } finally { cleanup(); removeDb(dbPath); }
});

test("terminal transition updates open count", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);
        advanceStatus(dbPath, sr.id, "In Progress");

        const before = service.getDashboardSummary();
        assert.equal(before.serviceRequests.open, 1);

        advanceStatus(dbPath, sr.id, "Completed");

        const after = service.getDashboardSummary();
        assert.equal(after.serviceRequests.open,  0);
        assert.equal(after.serviceRequests.total, before.serviceRequests.total);
    } finally { cleanup(); removeDb(dbPath); }
});

test("recent requests return no more than five", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        for (let i = 1; i <= 8; i++) {
            seedServiceRequest(dbPath, resident.id, { dateRequested: `2026-09-0${i}` });
        }
        const summary = service.getDashboardSummary();
        assert.ok(summary.recentServiceRequests.length <= 5);
        assert.equal(summary.recentServiceRequests.length, 5);
    } finally { cleanup(); removeDb(dbPath); }
});

test("recent requests use correct ordering", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        const sr1 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-01" });
        const sr2 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-05" });
        const sr3 = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-05" });

        const summary = service.getDashboardSummary();
        const ids = summary.recentServiceRequests.map(r => r.id);

        assert.equal(ids[0], sr3.id); // same date, higher id first
        assert.equal(ids[1], sr2.id);
        assert.equal(ids[2], sr1.id);
    } finally { cleanup(); removeDb(dbPath); }
});

test("terminal requests may appear in recent results", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id, { dateRequested: "2026-09-30" });
        advanceStatus(dbPath, sr.id, "In Progress");
        advanceStatus(dbPath, sr.id, "Completed");

        const summary = service.getDashboardSummary();
        const found = summary.recentServiceRequests.find(r => r.id === sr.id);
        assert.ok(found, "Completed request should appear in recent list");
        assert.equal(found.status, "Completed");
    } finally { cleanup(); removeDb(dbPath); }
});

test("dashboard GET does not modify persistence", async () => {
    const dbPath = createTempDb();
    const { service, cleanup } = createDashboardService(dbPath);
    try {
        const resident = seedResident(dbPath);
        seedServiceRequest(dbPath, resident.id);

        const before = service.getDashboardSummary();

        const app = createTestApp(dbPath);
        await request(app).get("/dashboard");
        await request(app).get("/dashboard");

        const after = service.getDashboardSummary();
        assert.equal(after.residents.total,       before.residents.total);
        assert.equal(after.serviceRequests.total, before.serviceRequests.total);
        assert.equal(after.serviceRequests.pending, before.serviceRequests.pending);
    } finally { cleanup(); removeDb(dbPath); }
});
