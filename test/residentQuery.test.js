import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { Resident } from "../src/models/Resident.js";
import { ResidentRepository } from "../src/repositories/ResidentRepository.js";
import ResidentQueryService from "../src/services/ResidentQueryService.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTemporaryDatabasePath() {
    const fileName = `csms-t05-${crypto.randomUUID()}.sqlite`;
    return path.join(os.tmpdir(), fileName);
}

function removeDatabase(databasePath) {
    if (fs.existsSync(databasePath)) {
        fs.unlinkSync(databasePath);
    }
}

function createQuerySetup() {
    const databasePath = createTemporaryDatabasePath();
    const repository = new ResidentRepository(databasePath);
    const service = new ResidentQueryService(repository);
    return { databasePath, repository, service };
}

function cleanupQuerySetup(databasePath, repository) {
    if (repository && typeof repository.close === "function") {
        repository.close();
    }
    removeDatabase(databasePath);
}

function makeResident(firstName, lastName, contactNumber, email, status = "Active") {
    return new Resident({
        firstName,
        lastName,
        address: "Barangay Santo Tomas",
        contactNumber,
        email,
        status
    });
}

// save() modifies the resident in-place and returns it
function saveResident(repository, resident) {
    return repository.save(resident);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("lists all persisted Residents", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        saveResident(repository, makeResident("Juan",  "Cruz",   "09171234561", "juan@example.com"));
        saveResident(repository, makeResident("Maria", "Santos", "09171234562", "maria@example.com"));
        saveResident(repository, makeResident("Ana",   "Reyes",  "09171234563", "ana@example.com"));

        const residents = service.listResidents();
        assert.equal(residents.length, 3);
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});

test("empty listing returns an empty array", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        const residents = service.listResidents();
        assert.ok(Array.isArray(residents));
        assert.deepEqual(residents, []);
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});

test("listing uses required Resident ordering", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        saveResident(repository, makeResident("Ana",   "Santos", "09171234561", "ana.santos@example.com"));
        saveResident(repository, makeResident("Pedro", "Cruz",   "09171234562", "pedro.cruz@example.com"));
        saveResident(repository, makeResident("Maria", "Andres", "09171234563", "maria.andres@example.com"));

        const firstJuan  = saveResident(repository, makeResident("Juan", "Cruz", "09171234564", "juan.one@example.com"));
        const secondJuan = saveResident(repository, makeResident("Juan", "Cruz", "09171234565", "juan.two@example.com"));

        const residents = service.listResidents();

        assert.equal(residents.length, 5);
        assert.equal(residents[0].lastName,  "Andres");
        assert.equal(residents[0].firstName, "Maria");
        assert.equal(residents[1].lastName,  "Cruz");
        assert.equal(residents[1].firstName, "Juan");
        assert.equal(residents[1].id, firstJuan.id);
        assert.equal(residents[2].id, secondJuan.id);
        assert.equal(residents[3].firstName, "Pedro");
        assert.equal(residents[4].lastName,  "Santos");
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});

test("searches partial first name case-insensitively", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        saveResident(repository, makeResident("Juan",  "Dela Cruz", "09171234561", "juan@example.com"));
        saveResident(repository, makeResident("Maria", "Santos",    "09171234562", "maria@example.com"));

        const results = service.searchResidents("   jUa   ");

        assert.equal(results.length, 1);
        assert.equal(results[0].firstName, "Juan");
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});

test("searches partial last name case-insensitively", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        saveResident(repository, makeResident("Juan",  "Dela Cruz", "09171234561", "juan@example.com"));
        saveResident(repository, makeResident("Maria", "Santos",    "09171234562", "maria@example.com"));

        const results = service.searchResidents("cRuZ");

        assert.equal(results.length, 1);
        assert.equal(results[0].lastName, "Dela Cruz");
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});

test("blank search returns all Residents", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        saveResident(repository, makeResident("Juan",  "Cruz",   "09171234561", "juan@example.com"));
        saveResident(repository, makeResident("Maria", "Santos", "09171234562", "maria@example.com"));

        const listed   = service.listResidents();
        const searched = service.searchResidents("      ");

        assert.deepEqual(
            searched.map((r) => r.id),
            listed.map((r) => r.id)
        );
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});

test("search with no match returns an empty array", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        saveResident(repository, makeResident("Juan", "Cruz", "09171234561", "juan@example.com"));

        const results = service.searchResidents("ZzzUnknownResident");

        assert.ok(Array.isArray(results));
        assert.deepEqual(results, []);
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});

test("search result preserves Resident information", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        const saved = saveResident(
            repository,
            makeResident("Juan", "Dela Cruz", "09171234567", "juan@example.com")
        );

        const results = service.searchResidents("Juan");

        assert.equal(results.length, 1);
        const resident = results[0];
        assert.equal(resident.id,            saved.id);
        assert.equal(resident.firstName,     "Juan");
        assert.equal(resident.lastName,      "Dela Cruz");
        assert.equal(resident.address,       "Barangay Santo Tomas");
        assert.equal(resident.contactNumber, "09171234567");
        assert.equal(resident.email,         "juan@example.com");
        assert.equal(resident.status,        "Active");
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});

test("listing includes Active and Inactive Residents", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        saveResident(repository, makeResident("Juan",  "Cruz",   "09171234561", "juan@example.com"));
        saveResident(repository, makeResident("Maria", "Santos", "09171234562", "maria@example.com", "Inactive"));

        const residents = service.listResidents();
        const statuses  = residents.map((r) => r.status);

        assert.ok(statuses.includes("Active"));
        assert.ok(statuses.includes("Inactive"));
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});

test("matching Resident appears only once", () => {
    const { databasePath, repository, service } = createQuerySetup();
    try {
        const saved = saveResident(
            repository,
            makeResident("Ana", "Anaya", "09171234561", "ana@example.com")
        );

        const results = service.searchResidents("ana");

        assert.equal(results.length, 1);
        assert.equal(results[0].id, saved.id);
    } finally {
        cleanupQuerySetup(databasePath, repository);
    }
});
