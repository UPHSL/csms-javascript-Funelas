import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import ResidentDeactivationService from "../src/services/ResidentDeactivationService.js";
import ResidentQueryService from "../src/services/ResidentQueryService.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTemporaryDatabasePath() {
    const fileName = `csms-t07-${crypto.randomUUID()}.sqlite`;
    return path.join(os.tmpdir(), fileName);
}

function removeDatabase(databasePath) {
    if (fs.existsSync(databasePath)) {
        fs.unlinkSync(databasePath);
    }
}

function createDeactivationSetup() {
    const databasePath = createTemporaryDatabasePath();
    const repository = new ResidentRepository(databasePath);
    const service = new ResidentDeactivationService(repository);
    const queryService = new ResidentQueryService(repository);
    return { databasePath, repository, service, queryService };
}

function cleanupDeactivationSetup(databasePath, repository) {
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

// ─── Tests ──────────────────────────────────────────────────────────────────

test("Active Resident can be deactivated", () => {
    const { databasePath, repository, service } = createDeactivationSetup();
    try {
        const resident = makeResident();
        repository.save(resident);

        const result = service.deactivateResident(resident.id);

        assert.equal(result.success, true);
        assert.ok(result.resident);
        assert.equal(result.notFound, false);
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});

test("Resident status becomes Inactive in persistence", () => {
    const { databasePath, repository, service } = createDeactivationSetup();
    try {
        const resident = makeResident();
        repository.save(resident);

        service.deactivateResident(resident.id);

        const retrieved = repository.findById(resident.id);
        assert.equal(retrieved.status, "Inactive");
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});

test("Resident ID is preserved after deactivation", () => {
    const { databasePath, repository, service } = createDeactivationSetup();
    try {
        const resident = makeResident();
        repository.save(resident);
        const originalId = resident.id;

        const result = service.deactivateResident(resident.id);

        assert.equal(result.resident.id, originalId);
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});

test("Resident information is preserved after deactivation", () => {
    const { databasePath, repository, service } = createDeactivationSetup();
    try {
        const resident = makeResident();
        repository.save(resident);

        service.deactivateResident(resident.id);

        const retrieved = repository.findById(resident.id);
        assert.equal(retrieved.firstName,     "Juan");
        assert.equal(retrieved.lastName,      "Cruz");
        assert.equal(retrieved.address,       "Barangay Santo Tomas");
        assert.equal(retrieved.contactNumber, "09171234567");
        assert.equal(retrieved.email,         "juan@example.com");
        assert.equal(retrieved.status,        "Inactive");
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});

test("deactivated Resident remains persisted and retrievable", () => {
    const { databasePath, repository, service } = createDeactivationSetup();
    try {
        const resident = makeResident();
        repository.save(resident);

        service.deactivateResident(resident.id);

        const retrieved = repository.findById(resident.id);
        assert.ok(retrieved !== null);
        assert.equal(retrieved.id,     resident.id);
        assert.equal(retrieved.status, "Inactive");
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});

test("deactivated Resident remains available through T05", () => {
    const { databasePath, repository, service, queryService } = createDeactivationSetup();
    try {
        const resident = makeResident({ firstName: "Maria", lastName: "Santos" });
        repository.save(resident);

        service.deactivateResident(resident.id);

        const searchResults = queryService.searchResidents("Maria");
        const found = searchResults.find((r) => r.id === resident.id);

        assert.ok(found, "deactivated Resident should still appear in search");
        assert.equal(found.status, "Inactive");

        const listed = queryService.listResidents();
        const listedFound = listed.find((r) => r.id === resident.id);
        assert.ok(listedFound, "deactivated Resident should still appear in listing");
        assert.equal(listedFound.status, "Inactive");
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});

test("already-Inactive Resident is handled safely", () => {
    const { databasePath, repository, service } = createDeactivationSetup();
    try {
        const resident = makeResident({ status: "Inactive" });
        repository.save(resident);
        const originalId = resident.id;

        const result = service.deactivateResident(resident.id);

        assert.equal(result.success,         true);
        assert.equal(result.alreadyInactive, true);
        assert.equal(result.notFound,        false);
        assert.ok(result.resident);
        assert.equal(result.resident.id,     originalId);
        assert.equal(result.resident.status, "Inactive");
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});

test("nonexistent Resident is handled safely", () => {
    const { databasePath, repository, service } = createDeactivationSetup();
    try {
        const result = service.deactivateResident(999999);

        assert.equal(result.success,  false);
        assert.equal(result.notFound, true);
        assert.equal(result.resident, null);
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});

test("nonexistent deactivation does not create or delete records", () => {
    const { databasePath, repository, service } = createDeactivationSetup();
    try {
        const resident = makeResident();
        repository.save(resident);

        const before = repository.findAll();

        service.deactivateResident(999999);

        const after = repository.findAll();

        assert.equal(after.length, before.length);
        assert.ok(after.find((r) => r.id === resident.id));
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});

test("deactivating one Resident does not affect another", () => {
    const { databasePath, repository, service } = createDeactivationSetup();
    try {
        const resident1 = makeResident({ email: "one@example.com", contactNumber: "09171234561" });
        const resident2 = makeResident({ email: "two@example.com", contactNumber: "09171234562" });
        repository.save(resident1);
        repository.save(resident2);

        service.deactivateResident(resident1.id);

        const retrieved1 = repository.findById(resident1.id);
        const retrieved2 = repository.findById(resident2.id);

        assert.equal(retrieved1.status, "Inactive");
        assert.equal(retrieved2.status, "Active");

        // Other Resident's information must be unchanged
        assert.equal(retrieved2.firstName,     "Juan");
        assert.equal(retrieved2.contactNumber, "09171234562");
    } finally {
        cleanupDeactivationSetup(databasePath, repository);
    }
});
