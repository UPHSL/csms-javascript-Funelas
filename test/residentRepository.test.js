import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ResidentRepository } from '../src/repositories/ResidentRepository.js';
import { Resident } from '../src/models/Resident.js';

function tempDbPath() {
  const dir = mkdtempSync(join(tmpdir(), 'csms-test-'));
  return join(dir, 'test.db');
}

function validResident() {
  return new Resident({
    firstName: 'Juan',
    lastName: 'dela Cruz',
    address: '123 Rizal St',
    contactNumber: '09171234567',
    email: 'juan@example.com',
    status: 'Active'
  });
}

// Tests 1–6 share one repo
let repo;
let dbPath;

before(() => {
  dbPath = tempDbPath();
  repo = new ResidentRepository(dbPath);
});

after(() => {
  repo.close();
});

test('persists a resident', () => {
  const resident = validResident();
  repo.save(resident);
  assert.ok(resident.id);
});

test('resident receives a database-generated id', () => {
  const resident = validResident();
  assert.equal(resident.id, null);
  repo.save(resident);
  assert.ok(resident.id !== null);
});

test('retrieves resident by id', () => {
  const resident = validResident();
  repo.save(resident);
  const result = repo.findById(resident.id);
  assert.ok(result instanceof Resident);
});

test('preserves all resident information', () => {
  const resident = validResident();
  repo.save(resident);
  const result = repo.findById(resident.id);
  assert.equal(result.firstName,     resident.firstName);
  assert.equal(result.lastName,      resident.lastName);
  assert.equal(result.address,       resident.address);
  assert.equal(result.contactNumber, '09171234567');
  assert.equal(result.email,         resident.email);
  assert.equal(result.status,        resident.status);
});

test('preserves Active status', () => {
  const resident = validResident();
  repo.save(resident);
  const result = repo.findById(resident.id);
  assert.equal(result.status, 'Active');
});

test('returns null for missing resident', () => {
  const result = repo.findById(99999);
  assert.equal(result, null);
});

test('data survives across repository instances', () => {
  const path = tempDbPath();
  const repo1 = new ResidentRepository(path);
  const resident = validResident();
  repo1.save(resident);
  const savedId = resident.id;

  const repo2 = new ResidentRepository(path);
  const result = repo2.findById(savedId);

  assert.ok(result !== null);
  assert.equal(result.firstName, 'Juan');
});

test('manually set id is ignored, SQLite generates its own', () => {
  const path = tempDbPath();
  const repo1 = new ResidentRepository(path);

  // First resident — SQLite assigns id = 1
  const first = validResident();
  repo1.save(first);
  assert.equal(first.id, 1);

  // Second resident — manually set id = 1 before saving
  const secondResident = new Resident ({
    id: 11,
    firstName: "Allan",
    lastName: "Funelas",
    address: "1063 Jimenez St.",
    contactNumber: '09204096822',
    email: "funelasallanjohn@gmail.com"
    })

  // save() should not use the JS id — SQLite generates a new one
  repo1.save(secondResident);
  assert.notEqual(secondResident.id, 1); // must not collide with first resident
  assert.ok(secondResident.id > 1);           // SQLite gave it the next available id

});