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

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTemporaryDatabasePath() {
    const fileName = `csms-t09-${crypto.randomUUID()}.sqlite`;
    return path.join(os.tmpdir(), fileName);
}

function removeDatabase(databasePath) {
    if (fs.existsSync(databasePath)) {
        fs.unlinkSync(databasePath);
    }
}

function createSubmissionSetup() {
    const databasePath = createTemporaryDatabasePath();
    const residentRepository = new ResidentRepository(databasePath);
    const serviceRequestRepository = new ServiceRequestRepository(databasePath);
    const validator = new ServiceRequestValidator();
    const service = new ServiceRequestSubmissionService(
        validator,
        residentRepository,
        serviceRequestRepository
    );
    return { databasePath, residentRepository, serviceRequestRepository, validator, service };
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

function makeActiveResident(overrides = {}) {
    return new Resident({
        firstName: "Juan",
        lastName: "Cruz",
        address: "Barangay Santo Tomas",
        contactNumber: "09171234567",
        email: "juan@example.com",
        status: "Active",
        ...overrides
    });
}

function makeServiceRequest(residentId, overrides = {}) {
    return new ServiceRequest({
        residentId,
        serviceType: "Barangay Clearance",
        description: "Request for employment requirement",
        dateRequested: "2026-09-30",
        ...overrides
    });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("valid Service Request submission succeeds", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const request = makeServiceRequest(resident.id);
        const result = service.submitRequest(request);

        assert.equal(result.success, true);
        assert.ok(result.serviceRequest);
        assert.equal(result.errors.length, 0);
        assert.equal(result.residentNotFound, false);
        assert.equal(result.residentInactive, false);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("submitted Service Request receives a generated ID", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const request = makeServiceRequest(resident.id);
        assert.equal(request.id, null);

        const result = service.submitRequest(request);

        assert.equal(result.success, true);
        assert.ok(result.serviceRequest.id !== null);
        assert.ok(Number.isInteger(result.serviceRequest.id));
        assert.ok(result.serviceRequest.id > 0);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("submitted Service Request is persisted and retrievable", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const result = service.submitRequest(makeServiceRequest(resident.id));

        const retrieved = serviceRequestRepository.findById(result.serviceRequest.id);
        assert.ok(retrieved !== null);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("submitted Service Request information is preserved", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const request = makeServiceRequest(resident.id, {
            serviceType:   "Certificate Request",
            description:   "Requesting certificate for school enrollment",
            dateRequested: "2026-09-15"
        });

        const result = service.submitRequest(request);
        const retrieved = serviceRequestRepository.findById(result.serviceRequest.id);

        assert.equal(retrieved.residentId,    resident.id);
        assert.equal(retrieved.serviceType,   "Certificate Request");
        assert.equal(retrieved.description,   "Requesting certificate for school enrollment");
        assert.equal(retrieved.dateRequested, "2026-09-15");
        assert.equal(retrieved.status,        "Pending");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("submitted Service Request status is Pending", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const result = service.submitRequest(makeServiceRequest(resident.id));

        assert.equal(result.serviceRequest.status, "Pending");

        const retrieved = serviceRequestRepository.findById(result.serviceRequest.id);
        assert.equal(retrieved.status, "Pending");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("blank service type fails validation", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const result = service.submitRequest(makeServiceRequest(resident.id, { serviceType: "   " }));

        assert.equal(result.success, false);
        assert.ok(result.errors.includes("serviceType"));
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("blank description fails validation", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const result = service.submitRequest(makeServiceRequest(resident.id, { description: "" }));

        assert.equal(result.success, false);
        assert.ok(result.errors.includes("description"));
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("invalid request does not reach persistence", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const countBefore = serviceRequestRepository.count();

        service.submitRequest(makeServiceRequest(resident.id, { serviceType: "" }));

        const countAfter = serviceRequestRepository.count();
        assert.equal(countAfter, countBefore);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("nonexistent Resident prevents submission", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const result = service.submitRequest(makeServiceRequest(999999));

        assert.equal(result.success, false);
        assert.equal(result.residentNotFound, true);
        assert.equal(serviceRequestRepository.count(), 0);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("Inactive Resident cannot submit a new Service Request", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident({ status: "Inactive" });
        residentRepository.save(resident);

        const result = service.submitRequest(makeServiceRequest(resident.id));

        assert.equal(result.success, false);
        assert.equal(result.residentInactive, true);
        assert.equal(result.residentNotFound, false);
        assert.equal(serviceRequestRepository.count(), 0);

        // Resident remains unchanged
        const retrieved = residentRepository.findById(resident.id);
        assert.equal(retrieved.status, "Inactive");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("non-Pending initial status is rejected", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const request = makeServiceRequest(resident.id, { status: "Completed" });
        const result = service.submitRequest(request);

        assert.equal(result.success, false);
        assert.ok(result.errors.includes("status"));
        assert.equal(serviceRequestRepository.count(), 0);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("Service Request persists across repository instances", () => {
    const databasePath = path.join(os.tmpdir(), `csms-t09-${crypto.randomUUID()}.sqlite`);
    const repo1 = new ResidentRepository(databasePath);
    const srRepo1 = new ServiceRequestRepository(databasePath);
    const validator = new ServiceRequestValidator();
    const service = new ServiceRequestSubmissionService(validator, repo1, srRepo1);

    try {
        const resident = makeActiveResident();
        repo1.save(resident);

        const result = service.submitRequest(makeServiceRequest(resident.id));
        const savedId = result.serviceRequest.id;

        // Access via a second repository instance
        const srRepo2 = new ServiceRequestRepository(databasePath);
        const retrieved = srRepo2.findById(savedId);
        srRepo2.close();

        assert.ok(retrieved !== null);
        assert.equal(retrieved.id, savedId);
    } finally {
        repo1.close();
        srRepo1.close();
        if (fs.existsSync(databasePath)) fs.unlinkSync(databasePath);
    }
});

test("submission does not modify the Resident", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        service.submitRequest(makeServiceRequest(resident.id));

        const retrieved = residentRepository.findById(resident.id);
        assert.equal(retrieved.id,            resident.id);
        assert.equal(retrieved.firstName,     "Juan");
        assert.equal(retrieved.lastName,      "Cruz");
        assert.equal(retrieved.address,       "Barangay Santo Tomas");
        assert.equal(retrieved.contactNumber, "09171234567");
        assert.equal(retrieved.email,         "juan@example.com");
        assert.equal(retrieved.status,        "Active");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("invalid date requested fails validation", () => {
    const { databasePath, residentRepository, serviceRequestRepository, service } = createSubmissionSetup();
    try {
        const resident = makeActiveResident();
        residentRepository.save(resident);

        const result = service.submitRequest(makeServiceRequest(resident.id, { dateRequested: "not-a-date" }));

        assert.equal(result.success, false);
        assert.ok(result.errors.includes("dateRequested"));
        assert.equal(serviceRequestRepository.count(), 0);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});
