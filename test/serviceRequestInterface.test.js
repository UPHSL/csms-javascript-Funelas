import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import request from "supertest";

import { createApp } from "../src/app.js";
import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ServiceRequestValidator } from "../src/services/ServiceRequestValidator.js";
import ServiceRequestSubmissionService from "../src/services/ServiceRequestSubmissionService.js";
import ServiceRequestStatusService from "../src/services/ServiceRequestStatusService.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTempDb() {
    return path.join(os.tmpdir(), `csms-t13-${crypto.randomUUID()}.sqlite`);
}

function removeDb(dbPath) {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

function createTestApp(dbPath) {
    process.env.CSMS_DB_PATH = dbPath;
    return createApp();
}

function seedActiveResident(dbPath, overrides = {}) {
    const repo = new ResidentRepository(dbPath);
    const resident = new Resident({
        firstName: "Juan", lastName: "Cruz",
        address: "Barangay Santo Tomas",
        contactNumber: "09171234567",
        email: `r-${crypto.randomUUID()}@example.com`,
        status: "Active", ...overrides
    });
    repo.save(resident);
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

// ─── Tests ──────────────────────────────────────────────────────────────────

test("Service Request Management page loads", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app).get("/service-requests");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Service Request/i);
    } finally { removeDb(dbPath); }
});

test("persisted Service Requests are displayed", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        seedServiceRequest(dbPath, resident.id, { serviceType: "Barangay Clearance" });
        const app = createTestApp(dbPath);
        const res = await request(app).get("/service-requests");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Barangay Clearance/);
    } finally { removeDb(dbPath); }
});

test("required ordering is preserved in listing", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr1 = seedServiceRequest(dbPath, resident.id, { serviceType: "Type A", dateRequested: "2026-09-01" });
        const sr2 = seedServiceRequest(dbPath, resident.id, { serviceType: "Type B", dateRequested: "2026-09-15" });
        const app = createTestApp(dbPath);
        const res = await request(app).get("/service-requests");
        assert.equal(res.statusCode, 200);
        const posA = res.text.indexOf("Type A");
        const posB = res.text.indexOf("Type B");
        assert.ok(posB < posA, "newer date should appear first");
    } finally { removeDb(dbPath); }
});

test("text search uses T11 behavior", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        seedServiceRequest(dbPath, resident.id, { serviceType: "Barangay Clearance" });
        seedServiceRequest(dbPath, resident.id, { serviceType: "Community Assistance" });
        const app = createTestApp(dbPath);
        const res = await request(app).get("/service-requests?search=clear");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Barangay Clearance/);
        assert.doesNotMatch(res.text, /Community Assistance/);
    } finally { removeDb(dbPath); }
});

test("status filter uses T11 behavior", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr1 = seedServiceRequest(dbPath, resident.id, { serviceType: "Type A", dateRequested: "2026-09-01" });
        const sr2 = seedServiceRequest(dbPath, resident.id, { serviceType: "Type B", dateRequested: "2026-09-02" });
        advanceStatus(dbPath, sr2.id, "In Progress");
        const app = createTestApp(dbPath);
        const res = await request(app).get("/service-requests?status=Pending");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Type A/);
        assert.doesNotMatch(res.text, /Type B/);
    } finally { removeDb(dbPath); }
});

test("combined search and status filter works", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const srA = seedServiceRequest(dbPath, resident.id, { serviceType: "Barangay Clearance", dateRequested: "2026-09-01" });
        const srB = seedServiceRequest(dbPath, resident.id, { serviceType: "Barangay Clearance", dateRequested: "2026-09-02" });
        advanceStatus(dbPath, srB.id, "In Progress");
        const app = createTestApp(dbPath);
        const res = await request(app).get("/service-requests?search=clearance&status=Pending");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, new RegExp(`/service-requests/${srA.id}`));
        assert.doesNotMatch(res.text, new RegExp(`/service-requests/${srB.id}`));
    } finally { removeDb(dbPath); }
});

test("submission form is accessible", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app).get("/service-requests/new");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Resident ID/i);
        assert.match(res.text, /Service Type/i);
        assert.match(res.text, /Description/i);
        assert.match(res.text, /Date Requested/i);
        assert.doesNotMatch(res.text, /name="id"/);
        assert.doesNotMatch(res.text, /name="status"/);
    } finally { removeDb(dbPath); }
});

test("valid submission persists a Pending Service Request", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const app = createTestApp(dbPath);
        const res = await request(app)
            .post("/service-requests/new")
            .type("form")
            .send({
                residentId: resident.id,
                serviceType: "Barangay Clearance",
                description: "Employment requirement",
                dateRequested: "2026-09-30"
            });
        assert.equal(res.statusCode, 302);
        const srRepo = new ServiceRequestRepository(dbPath);
        const all = srRepo.findAll();
        srRepo.close();
        assert.equal(all.length, 1);
        assert.ok(all[0].id > 0);
        assert.equal(all[0].residentId, resident.id);
        assert.equal(all[0].serviceType, "Barangay Clearance");
        assert.equal(all[0].description, "Employment requirement");
        assert.equal(all[0].dateRequested, "2026-09-30");
        assert.equal(all[0].status, "Pending");
    } finally { removeDb(dbPath); }
});

test("invalid submission shows validation feedback", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const app = createTestApp(dbPath);
        const res = await request(app)
            .post("/service-requests/new")
            .type("form")
            .send({
                residentId: resident.id,
                serviceType: "",
                description: "Some description",
                dateRequested: "2026-09-30"
            });
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /invalid|required|serviceType/i);
        const srRepo = new ServiceRequestRepository(dbPath);
        assert.equal(srRepo.count(), 0);
        srRepo.close();
    } finally { removeDb(dbPath); }
});

test("missing Resident submission is rejected", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app)
            .post("/service-requests/new")
            .type("form")
            .send({
                residentId: 999999,
                serviceType: "Barangay Clearance",
                description: "Employment requirement",
                dateRequested: "2026-09-30"
            });
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /not found|Resident/i);
        const srRepo = new ServiceRequestRepository(dbPath);
        assert.equal(srRepo.count(), 0);
        srRepo.close();
    } finally { removeDb(dbPath); }
});

test("Inactive Resident submission is rejected", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath, { status: "Inactive" });
        const app = createTestApp(dbPath);
        const res = await request(app)
            .post("/service-requests/new")
            .type("form")
            .send({
                residentId: resident.id,
                serviceType: "Barangay Clearance",
                description: "Employment requirement",
                dateRequested: "2026-09-30"
            });
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Inactive|cannot|eligib/i);
        const srRepo = new ServiceRequestRepository(dbPath);
        assert.equal(srRepo.count(), 0);
        srRepo.close();
    } finally { removeDb(dbPath); }
});

test("existing Service Request details can be viewed", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id, { serviceType: "Certificate Request" });
        const app = createTestApp(dbPath);
        const res = await request(app).get(`/service-requests/${sr.id}`);
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Certificate Request/);
        assert.match(res.text, new RegExp(String(sr.residentId)));
        assert.match(res.text, /Pending/);
    } finally { removeDb(dbPath); }
});

test("missing Service Request view is handled safely", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app).get("/service-requests/999999");
        assert.equal(res.statusCode, 404);
        assert.match(res.text, /not found|999999/i);
    } finally { removeDb(dbPath); }
});

test("Pending request can start processing", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);
        const app = createTestApp(dbPath);
        const res = await request(app)
            .post(`/service-requests/${sr.id}/status`)
            .type("form")
            .send({ targetStatus: "In Progress" });
        assert.equal(res.statusCode, 302);
        const srRepo = new ServiceRequestRepository(dbPath);
        const updated = srRepo.findById(sr.id);
        srRepo.close();
        assert.equal(updated.status, "In Progress");
    } finally { removeDb(dbPath); }
});

test("Pending request can be cancelled", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);
        const app = createTestApp(dbPath);
        await request(app)
            .post(`/service-requests/${sr.id}/status`)
            .type("form")
            .send({ targetStatus: "Cancelled" });
        const srRepo = new ServiceRequestRepository(dbPath);
        const updated = srRepo.findById(sr.id);
        srRepo.close();
        assert.equal(updated.status, "Cancelled");
    } finally { removeDb(dbPath); }
});

test("In Progress request can be completed", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);
        advanceStatus(dbPath, sr.id, "In Progress");
        const app = createTestApp(dbPath);
        await request(app)
            .post(`/service-requests/${sr.id}/status`)
            .type("form")
            .send({ targetStatus: "Completed" });
        const srRepo = new ServiceRequestRepository(dbPath);
        const updated = srRepo.findById(sr.id);
        srRepo.close();
        assert.equal(updated.status, "Completed");
    } finally { removeDb(dbPath); }
});

test("In Progress request can be cancelled", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);
        advanceStatus(dbPath, sr.id, "In Progress");
        const app = createTestApp(dbPath);
        await request(app)
            .post(`/service-requests/${sr.id}/status`)
            .type("form")
            .send({ targetStatus: "Cancelled" });
        const srRepo = new ServiceRequestRepository(dbPath);
        const updated = srRepo.findById(sr.id);
        srRepo.close();
        assert.equal(updated.status, "Cancelled");
    } finally { removeDb(dbPath); }
});

test("invalid direct transition is still rejected by T10", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);
        const app = createTestApp(dbPath);
        await request(app)
            .post(`/service-requests/${sr.id}/status`)
            .type("form")
            .send({ targetStatus: "Completed" });
        const srRepo = new ServiceRequestRepository(dbPath);
        const unchanged = srRepo.findById(sr.id);
        srRepo.close();
        assert.equal(unchanged.status, "Pending");
    } finally { removeDb(dbPath); }
});

test("Completed and Cancelled requests remain visible", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr1 = seedServiceRequest(dbPath, resident.id, { serviceType: "Type Completed", dateRequested: "2026-09-01" });
        const sr2 = seedServiceRequest(dbPath, resident.id, { serviceType: "Type Cancelled", dateRequested: "2026-09-02" });
        advanceStatus(dbPath, sr1.id, "In Progress");
        advanceStatus(dbPath, sr1.id, "Completed");
        advanceStatus(dbPath, sr2.id, "Cancelled");
        const app = createTestApp(dbPath);
        const res = await request(app).get("/service-requests");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Type Completed/);
        assert.match(res.text, /Type Cancelled/);
    } finally { removeDb(dbPath); }
});

test("GET requests do not change Service Request state", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedActiveResident(dbPath);
        const sr = seedServiceRequest(dbPath, resident.id);
        const app = createTestApp(dbPath);
        await request(app).get("/service-requests");
        await request(app).get("/service-requests/new");
        await request(app).get(`/service-requests/${sr.id}`);
        const srRepo = new ServiceRequestRepository(dbPath);
        const unchanged = srRepo.findById(sr.id);
        srRepo.close();
        assert.equal(unchanged.status, "Pending");
    } finally { removeDb(dbPath); }
});
