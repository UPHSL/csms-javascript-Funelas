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
    return path.join(os.tmpdir(), `csms-t15-${crypto.randomUUID()}.sqlite`);
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
    new ServiceRequestStatusService(srRepo).manageStatus(srId, targetStatus);
    srRepo.close();
}

// ─── Category 1: Invalid or Malformed Input ─────────────────────────────────

test("T15 | malformed Resident ID in URL is handled safely without crash", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);

        const editRes  = await request(app).get("/residents/abc/edit");
        const postRes  = await request(app).post("/residents/abc/edit").type("form").send({
            firstName: "Juan", lastName: "Cruz",
            address: "Barangay", contactNumber: "09171234567", email: "j@example.com"
        });

        assert.equal(editRes.statusCode, 404);
        assert.equal(postRes.statusCode, 404);

        // Must render a controlled not-found page, not a raw exception
        assert.match(editRes.text, /not found|abc/i);

        // No record must be created
        const repo = new ResidentRepository(dbPath);
        assert.equal(repo.findAll().length, 0);
        repo.close();
    } finally { removeDb(dbPath); }
});

// ─── Category 2: Rejected Mutation Protects Persistence ─────────────────────

test("T15 | invalid Resident update does not partially modify persisted fields", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedResident(dbPath, {
            firstName: "Juan",
            lastName: "Cruz",
            contactNumber: "09171234567"
        });

        const app = createTestApp(dbPath);
        await request(app)
            .post(`/residents/${resident.id}/edit`)
            .type("form")
            .send({
                firstName: "Miguel",      // valid — would change
                lastName: "Santos",       // valid — would change
                address: "New Address",
                contactNumber: "INVALID", // invalid — whole update must fail
                email: "m@example.com"
            });

        const repo = new ResidentRepository(dbPath);
        const retrieved = repo.findById(resident.id);
        repo.close();

        // All fields must remain exactly as they were
        assert.equal(retrieved.firstName,     "Juan");
        assert.equal(retrieved.lastName,      "Cruz");
        assert.equal(retrieved.contactNumber, "09171234567");
    } finally { removeDb(dbPath); }
});

// ─── Category 3: Read-Only Request Safety ───────────────────────────────────

test("T15 | repeated dashboard GET requests do not modify any persisted data", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);

        const resRepo = new ResidentRepository(dbPath);
        const srRepo  = new ServiceRequestRepository(dbPath);
        const dashboard = new DashboardService(resRepo, srRepo);
        const before = dashboard.getDashboardSummary();
        resRepo.close();
        srRepo.close();

        const app = createTestApp(dbPath);
        for (let i = 0; i < 5; i++) {
            await request(app).get("/dashboard");
        }

        const resRepo2 = new ResidentRepository(dbPath);
        const srRepo2  = new ServiceRequestRepository(dbPath);
        const dashboard2 = new DashboardService(resRepo2, srRepo2);
        const after = dashboard2.getDashboardSummary();
        resRepo2.close();
        srRepo2.close();

        assert.equal(after.residents.total,       before.residents.total);
        assert.equal(after.serviceRequests.total, before.serviceRequests.total);
        assert.equal(after.serviceRequests.pending, before.serviceRequests.pending);

        const srRepo3 = new ServiceRequestRepository(dbPath);
        const retrieved = srRepo3.findById(sr.id);
        srRepo3.close();
        assert.equal(retrieved.status, "Pending");
    } finally { removeDb(dbPath); }
});

// ─── Category 4: Cross-Feature Regression ───────────────────────────────────

test("T15 | deactivating a Resident prevents new Service Request submission and updates dashboard", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedResident(dbPath);

        // Deactivate the Resident
        const resRepo1 = new ResidentRepository(dbPath);
        new ResidentDeactivationService(resRepo1).deactivateResident(resident.id);
        resRepo1.close();

        // Attempt Service Request submission — must fail
        const resRepo2 = new ResidentRepository(dbPath);
        const srRepo1  = new ServiceRequestRepository(dbPath);
        const validator = new ServiceRequestValidator();
        const submissionService = new ServiceRequestSubmissionService(validator, resRepo2, srRepo1);
        const result = submissionService.submitRequest(new ServiceRequest({
            residentId:    resident.id,
            serviceType:   "Barangay Clearance",
            description:   "Employment requirement",
            dateRequested: "2026-09-30"
        }));
        resRepo2.close();
        srRepo1.close();

        assert.equal(result.success,         false);
        assert.equal(result.residentInactive, true);

        // Dashboard must reflect the deactivation
        const resRepo3 = new ResidentRepository(dbPath);
        const srRepo2  = new ServiceRequestRepository(dbPath);
        const summary = new DashboardService(resRepo3, srRepo2).getDashboardSummary();
        resRepo3.close();
        srRepo2.close();

        assert.equal(summary.residents.active,   0);
        assert.equal(summary.residents.inactive, 1);
        assert.equal(summary.serviceRequests.total, 0);
    } finally { removeDb(dbPath); }
});

// ─── Category 5: Repeatability / Boundary Behavior ──────────────────────────

test("T15 | terminal Service Request cannot be transitioned even after repeated attempts", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);

        // Reach Completed via valid path
        advanceStatus(dbPath, sr.id, "In Progress");
        advanceStatus(dbPath, sr.id, "Completed");

        const srRepo = new ServiceRequestRepository(dbPath);
        const statusService = new ServiceRequestStatusService(srRepo);

        // Attempt multiple invalid transitions
        const attempt1 = statusService.manageStatus(sr.id, "Pending");
        const attempt2 = statusService.manageStatus(sr.id, "In Progress");
        const attempt3 = statusService.manageStatus(sr.id, "Cancelled");
        srRepo.close();

        assert.equal(attempt1.success, false);
        assert.equal(attempt2.success, false);
        assert.equal(attempt3.success, false);

        // Status must remain Completed in persistence
        const srRepo2 = new ServiceRequestRepository(dbPath);
        const retrieved = srRepo2.findById(sr.id);
        srRepo2.close();
        assert.equal(retrieved.status, "Completed");

        // All other fields must be unchanged
        assert.equal(retrieved.id,          sr.id);
        assert.equal(retrieved.residentId,  sr.residentId);
        assert.equal(retrieved.serviceType, sr.serviceType);
    } finally { removeDb(dbPath); }
});
