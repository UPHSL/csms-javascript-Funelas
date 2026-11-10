import path from "node:path";
import { fileURLToPath } from "node:url";

import { Resident } from "../models/Resident.js";
import { ResidentRepository } from "../repositories/ResidentRepository.js";
import { ResidentValidator } from "../services/ResidentValidator.js";
import ResidentRegistrationService from "../services/ResidentRegistrationService.js";
import ResidentQueryService from "../services/ResidentQueryService.js";
import ResidentUpdateService from "../services/ResidentUpdateService.js";
import ResidentDeactivationService from "../services/ResidentDeactivationService.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const DEFAULT_DB_PATH = path.join(currentDirectory, "..", "..", "csms.sqlite");

function getDbPath() {
    return process.env.CSMS_DB_PATH ?? DEFAULT_DB_PATH;
}

// GET /residents
export function listResidents(req, res) {
    const repository = new ResidentRepository(getDbPath());
    try {
        const queryService = new ResidentQueryService(repository);
        const searchTerm = req.query.search ?? "";
        const residents = queryService.searchResidents(searchTerm);
        res.render("residents/index", {
            residents,
            searchTerm,
            flash: req.query.flash ?? null
        });
    } finally {
        repository.close();
    }
}

// GET /residents/register
export function showRegisterForm(req, res) {
    res.render("residents/register", {
        errors: [],
        values: {}
    });
}

// POST /residents/register
export function registerResident(req, res) {
    const repository = new ResidentRepository(getDbPath());
    try {
        const validator = new ResidentValidator();
        const registrationService = new ResidentRegistrationService(validator, repository);
        const { firstName, lastName, address, contactNumber, email } = req.body;

        const resident = new Resident({ firstName, lastName, address, contactNumber, email });
        const result = registrationService.registerResident(resident);

        if (!result.success) {
            return res.render("residents/register", {
                errors: result.errors,
                values: { firstName, lastName, address, contactNumber, email }
            });
        }

        res.redirect("/residents?flash=Resident+registered+successfully.");
    } finally {
        repository.close();
    }
}

// GET /residents/:id/edit
export function showEditForm(req, res) {
    const repository = new ResidentRepository(getDbPath());
    try {
        const id = Number(req.params.id);
        const resident = repository.findById(id);

        if (!resident) {
            return res.status(404).render("residents/notfound", { id });
        }

        res.render("residents/edit", {
            resident,
            errors: [],
            values: {
                firstName: resident.firstName,
                lastName: resident.lastName,
                address: resident.address,
                contactNumber: resident.contactNumber,
                email: resident.email
            }
        });
    } finally {
        repository.close();
    }
}

// POST /residents/:id/edit
export function updateResident(req, res) {
    const repository = new ResidentRepository(getDbPath());
    try {
        const validator = new ResidentValidator();
        const updateService = new ResidentUpdateService(validator, repository);
        const id = Number(req.params.id);
        const { firstName, lastName, address, contactNumber, email } = req.body;

        const result = updateService.updateResident(id, { firstName, lastName, address, contactNumber, email });

        if (result.notFound) {
            return res.status(404).render("residents/notfound", { id });
        }

        if (!result.success) {
            const existing = repository.findById(id);
            return res.render("residents/edit", {
                resident: existing,
                errors: result.errors,
                values: { firstName, lastName, address, contactNumber, email }
            });
        }

        res.redirect("/residents?flash=Resident+information+updated+successfully.");
    } finally {
        repository.close();
    }
}

// POST /residents/:id/deactivate
export function deactivateResident(req, res) {
    const repository = new ResidentRepository(getDbPath());
    try {
        const deactivationService = new ResidentDeactivationService(repository);
        const id = Number(req.params.id);

        const result = deactivationService.deactivateResident(id);

        if (result.notFound) {
            return res.status(404).render("residents/notfound", { id });
        }

        res.redirect("/residents?flash=Resident+deactivated+successfully.");
    } finally {
        repository.close();
    }
}
