import path from "node:path";
import { fileURLToPath } from "node:url";

import { ServiceRequest } from "../models/ServiceRequest.js";
import { ResidentRepository } from "../repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../repositories/ServiceRequestRepository.js";
import { ServiceRequestValidator } from "../services/ServiceRequestValidator.js";
import ServiceRequestSubmissionService from "../services/ServiceRequestSubmissionService.js";
import ServiceRequestStatusService from "../services/ServiceRequestStatusService.js";
import ServiceRequestQueryService from "../services/ServiceRequestQueryService.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const DEFAULT_DB_PATH = path.join(currentDirectory, "..", "..", "csms.sqlite");

function getDbPath() {
    return process.env.CSMS_DB_PATH ?? DEFAULT_DB_PATH;
}
function parseId(raw) {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function makeRepositories() {
    const dbPath = getDbPath();
    const residentRepository = new ResidentRepository(dbPath);
    const serviceRequestRepository = new ServiceRequestRepository(dbPath);
    return { residentRepository, serviceRequestRepository };
}

// GET /service-requests
export function listServiceRequests(req, res) {
    const { residentRepository, serviceRequestRepository } = makeRepositories();
    try {
        const queryService = new ServiceRequestQueryService(serviceRequestRepository);
        const searchTerm = req.query.search ?? "";
        const statusFilter = req.query.status ?? "";
        const { results } = queryService.searchServiceRequests(searchTerm, statusFilter);
        res.render("service-requests/index", {
            serviceRequests: results,
            searchTerm,
            statusFilter,
            flash: req.query.flash ?? null
        });
    } finally {
        residentRepository.close();
        serviceRequestRepository.close();
    }
}

// GET /service-requests/new
export function showSubmitForm(req, res) {
    res.render("service-requests/submit", {
        errors: [],
        values: {},
        residentError: null
    });
}

// POST /service-requests/new
export function submitServiceRequest(req, res) {
    const { residentRepository, serviceRequestRepository } = makeRepositories();
    try {
        const validator = new ServiceRequestValidator();
        const submissionService = new ServiceRequestSubmissionService(
            validator, residentRepository, serviceRequestRepository
        );

        const { residentId, serviceType, description, dateRequested } = req.body;

        const serviceRequest = new ServiceRequest({
            residentId: Number(residentId),
            serviceType,
            description,
            dateRequested
        });

        const result = submissionService.submitRequest(serviceRequest);

        if (result.residentNotFound) {
            return res.render("service-requests/submit", {
                errors: [],
                values: { residentId, serviceType, description, dateRequested },
                residentError: "Resident not found. Please check the Resident ID."
            });
        }

        if (result.residentInactive) {
            return res.render("service-requests/submit", {
                errors: [],
                values: { residentId, serviceType, description, dateRequested },
                residentError: "Inactive Residents cannot submit new Service Requests."
            });
        }

        if (!result.success) {
            return res.render("service-requests/submit", {
                errors: result.errors,
                values: { residentId, serviceType, description, dateRequested },
                residentError: null
            });
        }

        res.redirect("/service-requests?flash=Service+Request+submitted+successfully.");
    } finally {
        residentRepository.close();
        serviceRequestRepository.close();
    }
}

// GET /service-requests/:id
export function viewServiceRequest(req, res) {
    const { residentRepository, serviceRequestRepository } = makeRepositories();
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(404).render("service-requests/notfound", { id: req.params.id });
        }
        const queryService = new ServiceRequestQueryService(serviceRequestRepository);
        const serviceRequest = queryService.viewServiceRequest(id);
        if (!serviceRequest) {
            return res.status(404).render("service-requests/notfound", { id });
        }
        res.render("service-requests/view", {
            serviceRequest,
            flash: req.query.flash ?? null
        });
    } finally {
        residentRepository.close();
        serviceRequestRepository.close();
    }
}

// POST /service-requests/:id/status
export function changeStatus(req, res) {
    const { residentRepository, serviceRequestRepository } = makeRepositories();
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(404).render("service-requests/notfound", { id: req.params.id });
        }
        const { targetStatus } = req.body;
        const statusService = new ServiceRequestStatusService(serviceRequestRepository);
        const result = statusService.manageStatus(id, targetStatus);
        if (result.notFound) {
            return res.status(404).render("service-requests/notfound", { id });
        }
        if (!result.success) {
            return res.redirect(`/service-requests/${id}?flash=Invalid+status+transition.`);
        }
        const messages = {
            "In Progress": "Service+Request+is+now+In+Progress.",
            "Completed":   "Service+Request+completed+successfully.",
            "Cancelled":   "Service+Request+cancelled+successfully."
        };
        const msg = messages[targetStatus] ?? "Status+updated.";
        res.redirect(`/service-requests/${id}?flash=${msg}`);
    } finally {
        residentRepository.close();
        serviceRequestRepository.close();
    }
}
