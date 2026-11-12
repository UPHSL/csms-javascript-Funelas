import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import { ResidentValidator } from "../src/services/ResidentValidator.js";
import ResidentUpdateService from "../src/services/ResidentUpdateService.js";
import ResidentQueryService from "../src/services/ResidentQueryService.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTemporaryDatabasePath() {
    const fileName = `csms-t06-${crypto.randomUUID()}.sqlite`;
    return path.join(os.tmpdir(), fileName);
}

function removeDatabase(databasePath) {
    if (fs.existsSync(databasePath)) {
        fs.unlinkSync(databasePath);
    }
}

function createUpdateSetup() {
    const databasePath = createTemporaryDatabasePath();
    const repository = new ResidentRepository(databasePath);
    const validator = new ResidentValidator();
    const service = new ResidentUpdateService(validator, repository);
    const queryService = new ResidentQueryService(repository);
    return { databasePath, repository, validator, service, queryService };
}

function cleanupUpdateSetup(databasePath, repository) {
    if (repository && typeof repository.close === "function") {
        repository.close();
    }
    removeDatabase(databasePath);
}

function makeResident(overrides = {}) {
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

function proposedInfo(overrides = {}) {
    return {
        firstName: "Juan Miguel",
        lastName: "Dela Cruz",
        address: "456 Rizal Avenue",
        contactNumber: "09181234567",
        email: "juanmiguel@example.com",
        ...overrides
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("valid Resident update succeeds", () => {
    const { databasePath, repository, service } = createUpdateSetup();
    try {
        const resident = makeResident();
        repository.save(resident);

        const result = service.updateResident(resident.id, proposedInfo());

        assert.equal(result.success, true);
        assert.ok(result.resident);
        assert.equal(result.errors.length, 0);
        assert.equal(result.notFound, false);
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});

test("Resident ID is preserved after update", () => {
    const { databasePath, repository, service } = createUpdateSetup();
    try {
        const resident = makeResident();
        repository.save(resident);
        const originalId = resident.id;

        const result = service.updateResident(resident.id, proposedInfo());

        assert.equal(result.success, true);
        assert.equal(result.resident.id, originalId);
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});

test("permitted Resident information is persisted", () => {
    const { databasePath, repository, service } = createUpdateSetup();
    try {
        const resident = makeResident();
        repository.save(resident);

        const info = proposedInfo();
        service.updateResident(resident.id, info);

        const retrieved = repository.findById(resident.id);

        assert.equal(retrieved.firstName,     info.firstName);
        assert.equal(retrieved.lastName,      info.lastName);
        assert.equal(retrieved.address,       info.address);
        assert.equal(retrieved.contactNumber, info.contactNumber);
        assert.equal(retrieved.email,         info.email);
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});

test("Resident status is preserved after update", () => {
    const { databasePath, repository, service } = createUpdateSetup();
    try {
        // Test Active preservation
        const activeResident = makeResident({ status: "Active" });
        repository.save(activeResident);
        const activeResult = service.updateResident(activeResident.id, proposedInfo());
        assert.equal(activeResult.resident.status, "Active");

        // Test Inactive preservation
        const inactiveResident = makeResident({ status: "Inactive" });
        repository.save(inactiveResident);
        const inactiveResult = service.updateResident(inactiveResident.id, proposedInfo());
        assert.equal(inactiveResult.resident.status, "Inactive");
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});

test("invalid update fails validation", () => {
    const { databasePath, repository, service } = createUpdateSetup();
    try {
        const resident = makeResident();
        repository.save(resident);

        const result = service.updateResident(resident.id, proposedInfo({ firstName: "" }));

        assert.equal(result.success, false);
        assert.equal(result.notFound, false);
        assert.ok(result.errors.length > 0);
        assert.ok(result.errors.includes("firstName"));
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});

test("invalid update does not modify persisted information", () => {
    const { databasePath, repository, service } = createUpdateSetup();
    try {
        const resident = makeResident();
        repository.save(resident);

        service.updateResident(resident.id, proposedInfo({ firstName: "", contactNumber: "ABC" }));

        const retrieved = repository.findById(resident.id);

        assert.equal(retrieved.firstName,     "Juan");
        assert.equal(retrieved.lastName,      "Cruz");
        assert.equal(retrieved.contactNumber, "09171234567");
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});

test("updating a nonexistent Resident is handled safely", () => {
    const { databasePath, repository, service } = createUpdateSetup();
    try {
        const result = service.updateResident(999999, proposedInfo());

        assert.equal(result.success, false);
        assert.equal(result.notFound, true);
        assert.equal(result.resident, null);
        assert.equal(result.errors.length, 0);
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});

test("nonexistent update does not create a Resident", () => {
    const { databasePath, repository, service } = createUpdateSetup();
    try {
        const before = repository.findAll();

        service.updateResident(999999, proposedInfo());

        const after = repository.findAll();

        assert.equal(after.length, before.length);
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});

test("updated Resident is visible through T05 querying", () => {
    const { databasePath, repository, service, queryService } = createUpdateSetup();
    try {
        const resident = makeResident({ firstName: "Juan", lastName: "Cruz" });
        repository.save(resident);

        service.updateResident(resident.id, proposedInfo({ firstName: "Miguel", lastName: "Santos" }));

        const results = queryService.searchResidents("Miguel");

        assert.equal(results.length, 1);
        assert.equal(results[0].firstName, "Miguel");
        assert.equal(results[0].lastName,  "Santos");
        assert.equal(results[0].id,        resident.id);
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});

test("updated information and contact number are preserved", () => {
    const { databasePath, repository, service } = createUpdateSetup();
    try {
        const resident = makeResident();
        repository.save(resident);
        const originalId = resident.id;

        const info = proposedInfo({ contactNumber: "09181234567" });
        service.updateResident(resident.id, info);

        const retrieved = repository.findById(originalId);

        assert.equal(retrieved.id,            originalId);
        assert.equal(retrieved.firstName,     info.firstName);
        assert.equal(retrieved.lastName,      info.lastName);
        assert.equal(retrieved.address,       info.address);
        assert.equal(retrieved.contactNumber, "09181234567");
        assert.equal(retrieved.email,         info.email);
        assert.equal(retrieved.status,        "Active");
    } finally {
        cleanupUpdateSetup(databasePath, repository);
    }
});
