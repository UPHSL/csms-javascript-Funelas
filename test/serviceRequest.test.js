import test from "node:test";
import assert from "node:assert/strict";

import { ServiceRequest } from "../src/models/ServiceRequest.js";

const TEST_DATE = "2026-09-30";

function makeServiceRequest(overrides = {}) {
    return new ServiceRequest({
        residentId: 25,
        serviceType: "Barangay Clearance",
        description: "Request for employment requirement",
        dateRequested: TEST_DATE,
        ...overrides
    });
}

test("Service Request can be created", () => {
    const request = makeServiceRequest();
    assert.ok(request);
});

test("Service Request information is accessible", () => {
    const request = makeServiceRequest();

    assert.equal(request.residentId,    25);
    assert.equal(request.serviceType,   "Barangay Clearance");
    assert.equal(request.description,   "Request for employment requirement");
    assert.equal(request.dateRequested, TEST_DATE);
});

test("Resident ID is preserved", () => {
    const request = makeServiceRequest({ residentId: 25 });
    assert.equal(request.residentId, 25);
});

test("new Service Request has an unassigned ID", () => {
    const request = makeServiceRequest();
    assert.equal(request.id, null);
});

test("new Service Request defaults to Pending", () => {
    const request = makeServiceRequest();
    assert.equal(request.status, "Pending");
});

test("Service Request information is independent between objects", () => {
    const first = makeServiceRequest({
        residentId:    25,
        serviceType:   "Barangay Clearance",
        description:   "First request",
        dateRequested: "2026-09-01"
    });

    const second = makeServiceRequest({
        residentId:    42,
        serviceType:   "Certificate Request",
        description:   "Second request",
        dateRequested: "2026-09-15"
    });

    assert.equal(first.residentId,    25);
    assert.equal(first.serviceType,   "Barangay Clearance");
    assert.equal(first.description,   "First request");
    assert.equal(first.dateRequested, "2026-09-01");

    assert.equal(second.residentId,    42);
    assert.equal(second.serviceType,   "Certificate Request");
    assert.equal(second.description,   "Second request");
    assert.equal(second.dateRequested, "2026-09-15");
});
