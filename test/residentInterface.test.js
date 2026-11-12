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
import { ResidentValidator } from "../src/services/ResidentValidator.js";
import ResidentRegistrationService from "../src/services/ResidentRegistrationService.js";
import ResidentDeactivationService from "../src/services/ResidentDeactivationService.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTempDb() {
    const fileName = `csms-t12-${crypto.randomUUID()}.sqlite`;
    return path.join(os.tmpdir(), fileName);
}

function removeDb(dbPath) {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

function seedResident(dbPath, overrides = {}) {
    const repo = new ResidentRepository(dbPath);
    const validator = new ResidentValidator();
    const service = new ResidentRegistrationService(validator, repo);
    const resident = new Resident({
        firstName: "Juan",
        lastName: "Cruz",
        address: "Barangay Santo Tomas",
        contactNumber: "09171234567",
        email: `juan-${crypto.randomUUID()}@example.com`,
        ...overrides
    });
    service.registerResident(resident);
    repo.close();
    return resident;
}

// Point the app at a temp DB for each test by overriding the DB path via env
function createTestApp(dbPath) {
    process.env.CSMS_DB_PATH = dbPath;
    return createApp();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("Resident Management page loads successfully", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app).get("/residents");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Resident Management/);
    } finally { removeDb(dbPath); }
});

test("Resident list displays persisted Residents", async () => {
    const dbPath = createTempDb();
    try {
        seedResident(dbPath, { firstName: "Maria", lastName: "Santos" });
        const app = createTestApp(dbPath);
        const res = await request(app).get("/residents");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Maria/);
        assert.match(res.text, /Santos/);
    } finally { removeDb(dbPath); }
});

test("Resident search uses existing search behavior", async () => {
    const dbPath = createTempDb();
    try {
        seedResident(dbPath, { firstName: "Maria", lastName: "Santos" });
        seedResident(dbPath, { firstName: "Pedro", lastName: "Cruz" });
        const app = createTestApp(dbPath);
        const res = await request(app).get("/residents?search=MAR");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Maria/);
        assert.doesNotMatch(res.text, /Pedro/);
    } finally { removeDb(dbPath); }
});

test("blank search displays all Residents", async () => {
    const dbPath = createTempDb();
    try {
        seedResident(dbPath, { firstName: "Maria", lastName: "Santos" });
        seedResident(dbPath, { firstName: "Pedro", lastName: "Cruz" });
        const app = createTestApp(dbPath);
        const res = await request(app).get("/residents?search=");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Maria/);
        assert.match(res.text, /Pedro/);
    } finally { removeDb(dbPath); }
});

test("registration form is accessible", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app).get("/residents/register");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /First Name/);
        assert.match(res.text, /Last Name/);
        assert.match(res.text, /Address/);
        assert.match(res.text, /Contact Number/);
        assert.match(res.text, /Email/);
    } finally { removeDb(dbPath); }
});

test("valid registration persists Resident", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app)
            .post("/residents/register")
            .type("form")
            .send({
                firstName: "Ana",
                lastName: "Reyes",
                address: "Barangay Uno",
                contactNumber: "09171234568",
                email: "ana@example.com"
            });
        assert.equal(res.statusCode, 302);

        const repo = new ResidentRepository(dbPath);
        const all = repo.findAll();
        repo.close();
        assert.equal(all.length, 1);
        assert.equal(all[0].firstName, "Ana");
        assert.ok(all[0].id > 0);
        assert.equal(all[0].status, "Active");
    } finally { removeDb(dbPath); }
});

test("invalid registration shows validation feedback and does not persist", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app)
            .post("/residents/register")
            .type("form")
            .send({
                firstName: "",
                lastName: "Reyes",
                address: "Barangay Uno",
                contactNumber: "09171234568",
                email: "ana@example.com"
            });
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /invalid|required|firstName/i);

        const repo = new ResidentRepository(dbPath);
        const all = repo.findAll();
        repo.close();
        assert.equal(all.length, 0);
    } finally { removeDb(dbPath); }
});

test("edit form displays existing Resident information", async () => {
    const dbPath = createTempDb();
    try {
        const resident = seedResident(dbPath, { firstName: "Carlos", lastName: "Dela Cruz" });
        const repo = new ResidentRepository(dbPath);
        const saved = repo.findAll()[0];
        repo.close();

        const app = createTestApp(dbPath);
        const res = await request(app).get(`/residents/${saved.id}/edit`);
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Carlos/);
        assert.match(res.text, /Dela Cruz/);
    } finally { removeDb(dbPath); }
});

test("valid update persists changes", async () => {
    const dbPath = createTempDb();
    try {
        seedResident(dbPath);
        const repo = new ResidentRepository(dbPath);
        const saved = repo.findAll()[0];
        repo.close();

        const app = createTestApp(dbPath);
        await request(app)
            .post(`/residents/${saved.id}/edit`)
            .type("form")
            .send({
                firstName: "Miguel",
                lastName: "Santos",
                address: "New Address",
                contactNumber: "09181234567",
                email: "miguel@example.com"
            });

        const repo2 = new ResidentRepository(dbPath);
        const updated = repo2.findById(saved.id);
        repo2.close();

        assert.equal(updated.firstName, "Miguel");
        assert.equal(updated.lastName, "Santos");
        assert.equal(updated.id, saved.id);
        assert.equal(updated.status, saved.status);
    } finally { removeDb(dbPath); }
});

test("invalid update does not modify Resident", async () => {
    const dbPath = createTempDb();
    try {
        seedResident(dbPath);
        const repo = new ResidentRepository(dbPath);
        const saved = repo.findAll()[0];
        repo.close();

        const app = createTestApp(dbPath);
        const res = await request(app)
            .post(`/residents/${saved.id}/edit`)
            .type("form")
            .send({
                firstName: "",
                lastName: "Santos",
                address: "New Address",
                contactNumber: "09181234567",
                email: "miguel@example.com"
            });

        assert.equal(res.statusCode, 200);
        assert.match(res.text, /invalid|required|firstName/i);

        const repo2 = new ResidentRepository(dbPath);
        const unchanged = repo2.findById(saved.id);
        repo2.close();
        assert.equal(unchanged.firstName, "Juan");
    } finally { removeDb(dbPath); }
});

test("missing Resident edit is handled safely", async () => {
    const dbPath = createTempDb();
    try {
        const app = createTestApp(dbPath);
        const res = await request(app).get("/residents/999999/edit");
        assert.equal(res.statusCode, 404);
        assert.match(res.text, /not found|999999/i);
    } finally { removeDb(dbPath); }
});

test("Active Resident can be deactivated through the interface", async () => {
    const dbPath = createTempDb();
    try {
        seedResident(dbPath);
        const repo = new ResidentRepository(dbPath);
        const saved = repo.findAll()[0];
        repo.close();

        const app = createTestApp(dbPath);
        const res = await request(app).post(`/residents/${saved.id}/deactivate`);
        assert.equal(res.statusCode, 302);

        const repo2 = new ResidentRepository(dbPath);
        const updated = repo2.findById(saved.id);
        repo2.close();
        assert.equal(updated.status, "Inactive");
        assert.ok(updated !== null);
    } finally { removeDb(dbPath); }
});

test("Inactive Resident remains visible after deactivation", async () => {
    const dbPath = createTempDb();
    try {
        seedResident(dbPath, { firstName: "Rosa", lastName: "Lim" });
        const repo = new ResidentRepository(dbPath);
        const saved = repo.findAll()[0];
        repo.close();

        const app = createTestApp(dbPath);
        await request(app).post(`/residents/${saved.id}/deactivate`);

        const res = await request(app).get("/residents");
        assert.equal(res.statusCode, 200);
        assert.match(res.text, /Rosa/);
        assert.match(res.text, /Inactive/);
    } finally { removeDb(dbPath); }
});

test("GET requests do not deactivate Residents", async () => {
    const dbPath = createTempDb();
    try {
        seedResident(dbPath);
        const repo = new ResidentRepository(dbPath);
        const saved = repo.findAll()[0];
        repo.close();

        const app = createTestApp(dbPath);
        await request(app).get("/residents");
        await request(app).get(`/residents/${saved.id}/edit`);

        const repo2 = new ResidentRepository(dbPath);
        const unchanged = repo2.findById(saved.id);
        repo2.close();
        assert.equal(unchanged.status, "Active");
    } finally { removeDb(dbPath); }
});
