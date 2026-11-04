import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { Resident } from "../src/models/Resident.js";
import { ServiceRequest } from "../src/models/ServiceRequest.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../src/repositories/ServiceRequestRepository.js";
import { ServiceRequestValidator } from "../src/services/ServiceRequestValidator.js";
import ServiceRequestSubmissionService from "../src/services/ServiceRequestSubmissionService.js";
import ServiceRequestStatusService from "../src/services/ServiceRequestStatusService.js";
import ServiceRequestQueryService from "../src/services/ServiceRequestQueryService.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTemporaryDatabasePath() {
    const fileName = `csms-t11-${crypto.randomUUID()}.sqlite`;
    return path.join(os.tmpdir(), fileName);
}

function removeDatabase(databasePath) {
    if (fs.existsSync(databasePath)) {
        fs.unlinkSync(databasePath);
    }
}

function createSetup() {
    const databasePath = createTemporaryDatabasePath();
    const residentRepository = new ResidentRepository(databasePath);
    const serviceRequestRepository = new ServiceRequestRepository(databasePath);
    const validator = new ServiceRequestValidator();
    const submissionService = new ServiceRequestSubmissionService(
        validator,
        residentRepository,
        serviceRequestRepository
    );
    const statusService = new ServiceRequestStatusService(serviceRequestRepository);
    const queryService = new ServiceRequestQueryService(serviceRequestRepository);
    return {
        databasePath,
        residentRepository,
        serviceRequestRepository,
        submissionService,
        statusService,
        queryService
    };
}

function cleanupSetup(databasePath, residentRepository, serviceRequestRepository) {
    if (residentRepository && typeof residentRepository.close === "function") {
        residentRepository.close();
    }
    if (serviceRequestRepository && typeof serviceRequestRepository.close === "function") {
        serviceRequestRepository.close();
    }
    removeDatabase(databasePath);
}

function makeActiveResident(residentRepository, overrides = {}) {
    const resident = new Resident({
        firstName: "Juan",
        lastName: "Cruz",
        address: "Barangay Santo Tomas",
        contactNumber: "09171234567",
        email: `resident-${crypto.randomUUID()}@example.com`,
        status: "Active",
        ...overrides
    });
    residentRepository.save(resident);
    return resident;
}

function submitRequest(submissionService, residentId, overrides = {}) {
    const result = submissionService.submitRequest(new ServiceRequest({
        residentId,
        serviceType: "Barangay Clearance",
        description: "Employment requirement",
        dateRequested: "2026-09-15",
        ...overrides
    }));
    return result.serviceRequest;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("list all persisted Service Requests", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);
        submitRequest(submissionService, resident.id);
        submitRequest(submissionService, resident.id, { serviceType: "Certificate Request", dateRequested: "2026-09-16" });
        submitRequest(submissionService, resident.id, { serviceType: "Community Assistance", dateRequested: "2026-09-17" });

        const results = queryService.listServiceRequests();
        assert.equal(results.length, 3);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("empty listing returns an empty collection", () => {
    const { databasePath, residentRepository, serviceRequestRepository, queryService } = createSetup();
    try {
        const results = queryService.listServiceRequests();
        assert.ok(Array.isArray(results));
        assert.deepEqual(results, []);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("listing uses required ordering: dateRequested DESC then id DESC", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);

        const srA = submitRequest(submissionService, resident.id, { dateRequested: "2026-09-15" });
        const srB = submitRequest(submissionService, resident.id, { dateRequested: "2026-09-18" });
        const srC = submitRequest(submissionService, resident.id, { dateRequested: "2026-09-18" });
        const srD = submitRequest(submissionService, resident.id, { dateRequested: "2026-09-10" });

        const results = queryService.listServiceRequests();

        assert.equal(results[0].id, srC.id);  // same date, higher id first
        assert.equal(results[1].id, srB.id);
        assert.equal(results[2].id, srA.id);
        assert.equal(results[3].id, srD.id);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("view existing Service Request by ID", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);
        const sr = submitRequest(submissionService, resident.id);

        const result = queryService.viewServiceRequest(sr.id);
        assert.ok(result !== null);
        assert.equal(result.id, sr.id);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("viewing an unknown ID is handled safely", () => {
    const { databasePath, residentRepository, serviceRequestRepository, queryService } = createSetup();
    try {
        const result = queryService.viewServiceRequest(999999);
        assert.equal(result, null);
        assert.equal(serviceRequestRepository.count(), 0);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("partial service-type search is case-insensitive", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);
        submitRequest(submissionService, resident.id, { serviceType: "Barangay Clearance" });
        submitRequest(submissionService, resident.id, { serviceType: "Community Assistance" });

        const { results } = queryService.searchServiceRequests("cLeAr");

        assert.equal(results.length, 1);
        assert.equal(results[0].serviceType, "Barangay Clearance");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("partial description search is case-insensitive", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);
        submitRequest(submissionService, resident.id, { description: "Requesting clearance for employment requirements" });
        submitRequest(submissionService, resident.id, { description: "Medical assistance needed" });

        const { results } = queryService.searchServiceRequests("EMPLOYMENT");

        assert.equal(results.length, 1);
        assert.ok(results[0].description.toLowerCase().includes("employment"));
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("blank search returns all Service Requests", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);
        submitRequest(submissionService, resident.id, { dateRequested: "2026-09-15" });
        submitRequest(submissionService, resident.id, { dateRequested: "2026-09-16" });

        const listed = queryService.listServiceRequests();
        const { results: searched } = queryService.searchServiceRequests("      ");

        assert.deepEqual(
            searched.map((r) => r.id),
            listed.map((r) => r.id)
        );
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("no text match returns an empty collection", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);
        submitRequest(submissionService, resident.id);

        const { results } = queryService.searchServiceRequests("ZzzNoMatchAtAll");

        assert.ok(Array.isArray(results));
        assert.deepEqual(results, []);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("status filter returns only matching status", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);
        const sr1 = submitRequest(submissionService, resident.id);
        const sr2 = submitRequest(submissionService, resident.id);
        statusService.manageStatus(sr2.id, "In Progress");

        const { results } = queryService.searchServiceRequests("", "Pending");

        assert.ok(results.every((r) => r.status === "Pending"));
        assert.ok(results.find((r) => r.id === sr1.id));
        assert.ok(!results.find((r) => r.id === sr2.id));
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("unfiltered query includes all statuses", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);

        const sr1 = submitRequest(submissionService, resident.id, { dateRequested: "2026-09-01" });
        const sr2 = submitRequest(submissionService, resident.id, { dateRequested: "2026-09-02" });
        const sr3 = submitRequest(submissionService, resident.id, { dateRequested: "2026-09-03" });
        const sr4 = submitRequest(submissionService, resident.id, { dateRequested: "2026-09-04" });

        statusService.manageStatus(sr2.id, "In Progress");
        statusService.manageStatus(sr3.id, "In Progress");
        statusService.manageStatus(sr3.id, "Completed");
        statusService.manageStatus(sr4.id, "Cancelled");

        const results = queryService.listServiceRequests();
        const statuses = results.map((r) => r.status);

        assert.ok(statuses.includes("Pending"));
        assert.ok(statuses.includes("In Progress"));
        assert.ok(statuses.includes("Completed"));
        assert.ok(statuses.includes("Cancelled"));
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("combined text search and status filter", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);

        // Matches text AND status
        const srA = submitRequest(submissionService, resident.id, { serviceType: "Barangay Clearance", dateRequested: "2026-09-01" });
        // Matches text only (status = Completed)
        const srB = submitRequest(submissionService, resident.id, { serviceType: "Barangay Clearance", dateRequested: "2026-09-02" });
        statusService.manageStatus(srB.id, "In Progress");
        statusService.manageStatus(srB.id, "Completed");
        // Matches status only (different text)
        submitRequest(submissionService, resident.id, { serviceType: "Community Assistance", dateRequested: "2026-09-03" });
        // Matches neither
        const srD = submitRequest(submissionService, resident.id, { serviceType: "Community Assistance", dateRequested: "2026-09-04" });
        statusService.manageStatus(srD.id, "In Progress");

        const { results } = queryService.searchServiceRequests("clearance", "Pending");

        assert.equal(results.length, 1);
        assert.equal(results[0].id, srA.id);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("matching Service Request is not duplicated", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);
        const sr = submitRequest(submissionService, resident.id, {
            serviceType: "Community Assistance",
            description: "Assistance requested for medical support"
        });

        const { results } = queryService.searchServiceRequests("assistance");

        assert.equal(results.length, 1);
        assert.equal(results[0].id, sr.id);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("query result preserves complete Service Request information", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, queryService } = createSetup();
    try {
        const resident = makeActiveResident(residentRepository);
        const sr = submitRequest(submissionService, resident.id, {
            serviceType: "Certificate Request",
            description: "Scholarship requirement",
            dateRequested: "2026-09-20"
        });

        const { results } = queryService.searchServiceRequests("Certificate");
        assert.equal(results.length, 1);

        const result = results[0];
        assert.equal(result.id,            sr.id);
        assert.equal(result.residentId,    resident.id);
        assert.equal(result.serviceType,   "Certificate Request");
        assert.equal(result.description,   "Scholarship requirement");
        assert.equal(result.dateRequested, "2026-09-20");
        assert.equal(result.status,        "Pending");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});
