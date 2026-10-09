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

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTemporaryDatabasePath() {
    const fileName = `csms-t10-${crypto.randomUUID()}.sqlite`;
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
    return { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService };
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

function submitValidRequest(residentRepository, submissionService, residentOverrides = {}) {
    const resident = makeActiveResident(residentOverrides);
    residentRepository.save(resident);

    const result = submissionService.submitRequest(new ServiceRequest({
        residentId: resident.id,
        serviceType: "Barangay Clearance",
        description: "Employment requirement",
        dateRequested: "2026-09-30"
    }));

    return result.serviceRequest;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("Pending can move to In Progress", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);

        const result = statusService.manageStatus(sr.id, "In Progress");

        assert.equal(result.success, true);
        assert.equal(result.serviceRequest.status, "In Progress");

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "In Progress");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("Pending can move to Cancelled", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);

        const result = statusService.manageStatus(sr.id, "Cancelled");

        assert.equal(result.success, true);
        assert.equal(result.serviceRequest.status, "Cancelled");

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "Cancelled");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("In Progress can move to Completed", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);
        statusService.manageStatus(sr.id, "In Progress");

        const result = statusService.manageStatus(sr.id, "Completed");

        assert.equal(result.success, true);
        assert.equal(result.serviceRequest.status, "Completed");

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "Completed");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("In Progress can move to Cancelled", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);
        statusService.manageStatus(sr.id, "In Progress");

        const result = statusService.manageStatus(sr.id, "Cancelled");

        assert.equal(result.success, true);
        assert.equal(result.serviceRequest.status, "Cancelled");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("Pending cannot move directly to Completed", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);

        const result = statusService.manageStatus(sr.id, "Completed");

        assert.equal(result.success, false);
        assert.equal(result.invalidTransition, true);

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "Pending");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("In Progress cannot return to Pending", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);
        statusService.manageStatus(sr.id, "In Progress");

        const result = statusService.manageStatus(sr.id, "Pending");

        assert.equal(result.success, false);
        assert.equal(result.invalidTransition, true);

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "In Progress");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("Completed is terminal", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);
        statusService.manageStatus(sr.id, "In Progress");
        statusService.manageStatus(sr.id, "Completed");

        const result = statusService.manageStatus(sr.id, "Cancelled");

        assert.equal(result.success, false);
        assert.equal(result.invalidTransition, true);

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "Completed");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("Cancelled is terminal", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);
        statusService.manageStatus(sr.id, "Cancelled");

        const result = statusService.manageStatus(sr.id, "In Progress");

        assert.equal(result.success, false);
        assert.equal(result.invalidTransition, true);

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "Cancelled");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("unsupported status is rejected", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);

        const result = statusService.manageStatus(sr.id, "Approved");

        assert.equal(result.success, false);
        assert.equal(result.unsupportedStatus, true);

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "Pending");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("nonexistent Service Request is handled safely", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);
        const countBefore = serviceRequestRepository.count();

        const result = statusService.manageStatus(999999, "In Progress");

        assert.equal(result.success, false);
        assert.equal(result.notFound, true);
        assert.equal(result.serviceRequest, null);
        assert.equal(serviceRequestRepository.count(), countBefore);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("successful transition preserves Service Request information", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);

        const result = statusService.manageStatus(sr.id, "In Progress");

        assert.equal(result.serviceRequest.id,            sr.id);
        assert.equal(result.serviceRequest.residentId,    sr.residentId);
        assert.equal(result.serviceRequest.serviceType,   sr.serviceType);
        assert.equal(result.serviceRequest.description,   sr.description);
        assert.equal(result.serviceRequest.dateRequested, sr.dateRequested);
        assert.equal(result.serviceRequest.status,        "In Progress");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("invalid transition does not modify persistence", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);

        statusService.manageStatus(sr.id, "Completed"); // invalid from Pending

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status,        "Pending");
        assert.equal(retrieved.id,            sr.id);
        assert.equal(retrieved.serviceType,   sr.serviceType);
        assert.equal(retrieved.description,   sr.description);
        assert.equal(retrieved.dateRequested, sr.dateRequested);
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

test("same-status request is rejected", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);

        const result = statusService.manageStatus(sr.id, "Pending");

        assert.equal(result.success, false);
        assert.equal(result.invalidTransition, true);

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "Pending");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});

// ─── Student-Designed Test ───────────────────────────────────────────────────

test("blank or whitespace status is rejected as unsupported", () => {
    const { databasePath, residentRepository, serviceRequestRepository, submissionService, statusService } = createSetup();
    try {
        const sr = submitValidRequest(residentRepository, submissionService);

        const result = statusService.manageStatus(sr.id, "   ");

        assert.equal(result.success, false);
        assert.equal(result.unsupportedStatus, true);

        const retrieved = serviceRequestRepository.findById(sr.id);
        assert.equal(retrieved.status, "Pending");
    } finally {
        cleanupSetup(databasePath, residentRepository, serviceRequestRepository);
    }
});
