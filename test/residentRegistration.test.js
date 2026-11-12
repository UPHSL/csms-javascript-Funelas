import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { DatabaseSync } from "node:sqlite";

import { Resident } from "../src/models/Resident.js";
import {ResidentValidator} from "../src/services/ResidentValidator.js";
import {ResidentRepository} from "../src/repositories/ResidentRepository.js";
import ResidentRegistrationService
  from "../src/services/ResidentRegistrationService.js";

function createTemporaryDatabasePath() {
  const fileName =
    `csms-t04-${crypto.randomUUID()}.sqlite`;

  return path.join(
    os.tmpdir(),
    fileName
  );
}
function removeDatabase(databasePath) {
  if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
  }
}
function makeValidResident() {
  return new Resident({
    firstName: "Juan",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com"
  });
}

function createRegistrationSetup() {
  const databasePath =
    createTemporaryDatabasePath();

  const repository =
    new ResidentRepository(databasePath);

  const validator =
    new ResidentValidator();

  const service =
    new ResidentRegistrationService(
      validator,
      repository
    );

  return {
    databasePath,
    repository,
    validator,
    service,
    cleanup() {
      repository.close();
      removeDatabase(databasePath);
    }
  };
}

test(
  "registers a valid Resident",
  () => {
    const {
      service,
      cleanup
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        true
      );

      assert.ok(
        result.resident
      );

      assert.deepEqual(
        result.errors,
        []
      );
    } finally {
      cleanup();
    }
  }
);
test(
  "registered Resident receives an identifier",
  () => {
    const {
      service,
      cleanup
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      assert.equal(
        resident.id,
        null
      );

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        true
      );

      assert.ok(
        result.resident
      );

      assert.notEqual(
        result.resident.id,
        null
      );

      assert.notEqual(
        result.resident.id,
        undefined
      );
    } finally {
      cleanup();
    }
  }
);
test(
  "registered Resident is persisted",
  () => {
    const {
      repository,
      service,
      cleanup
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        true
      );

      assert.ok(
        result.resident
      );

      const storedResident =
        repository.findById(
          result.resident.id
        );

      assert.ok(
        storedResident
      );

      assert.equal(
        storedResident.id,
        result.resident.id
      );
    } finally {
      cleanup();
    }
  }
);
test(
  "registered Resident information is preserved",
  () => {
    const {
      repository,
      service,
      cleanup
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      const result =
        service.registerResident(resident);

      const storedResident =
        repository.findById(
          result.resident.id
        );

      assert.ok(storedResident);

      assert.equal(
        storedResident.firstName,
        "Juan"
      );

      assert.equal(
        storedResident.lastName,
        "Dela Cruz"
      );

      assert.equal(
        storedResident.address,
        "Barangay Santo Tomas"
      );

      assert.equal(
        storedResident.contactNumber,
        "09171234567"
      );

      assert.equal(
        storedResident.email,
        "juan@example.com"
      );

      assert.equal(
        storedResident.status,
        "Active"
      );
    } finally {
      cleanup();
    }
  }
);
test(
  "registration preserves the default Active status",
  () => {
    const {
      service,
      cleanup
    } = createRegistrationSetup();

    try {
      const resident =
        makeValidResident();

      assert.equal(
        resident.status,
        "Active"
      );

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        true
      );

      assert.equal(
        result.resident.status,
        "Active"
      );
    } finally {
      cleanup();
    }
  }
);
function makeResidentWithMissingFirstName() {
  return new Resident({
    firstName: "",
    lastName: "Dela Cruz",
    address: "Barangay Santo Tomas",
    contactNumber: "09171234567",
    email: "juan@example.com"
  });
}
test(
  "invalid Resident registration fails",
  () => {
    const {
      service,
      cleanup
    } = createRegistrationSetup();

    try {
      const resident =
        makeResidentWithMissingFirstName();

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        result.resident,
        null
      );

      assert.ok(
        result.errors.length > 0
      );
    } finally {
      cleanup();
    }
  }
);
function countResidents(
  databasePath
) {
  const database =
    new DatabaseSync(databasePath);

  try {
    const statement =
      database.prepare(
        "SELECT COUNT(*) AS count FROM residents"
      );

    const row =
      statement.get();

    return Number(row.count);
  } finally {
    database.close();
  }
}
test(
  "invalid Resident is not persisted",
  () => {
    const {
      databasePath,
      service,
      cleanup
    } = createRegistrationSetup();

    try {
      const resident =
        makeResidentWithMissingFirstName();

      const countBefore =
        countResidents(databasePath);

      const result =
        service.registerResident(resident);

      const countAfter =
        countResidents(databasePath);

      assert.equal(
        result.success,
        false
      );

      assert.equal(
        countAfter,
        countBefore
      );
    } finally {
      cleanup();
    }
  }
);
test(
  "registration identifies the validation failure",
  () => {
    const {
      service,
      cleanup
    } = createRegistrationSetup();

    try {
      const resident =
        makeResidentWithMissingFirstName();

      const result =
        service.registerResident(resident);

      assert.equal(
        result.success,
        false
      );

      assert.ok(
        result.errors.includes(
          "firstName"
        )
      );
    } finally {
      cleanup();
    }
  }
);
