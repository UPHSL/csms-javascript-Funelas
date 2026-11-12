import path from "node:path";
import { fileURLToPath } from "node:url";

import { ResidentRepository } from "../repositories/ResidentRepository.js";
import { ServiceRequestRepository } from "../repositories/ServiceRequestRepository.js";
import DashboardService from "../services/DashboardService.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const DEFAULT_DB_PATH = path.join(currentDirectory, "..", "..", "csms.sqlite");

function getDbPath() {
    return process.env.CSMS_DB_PATH ?? DEFAULT_DB_PATH;
}

// GET /dashboard
export function showDashboard(req, res) {
    const residentRepository = new ResidentRepository(getDbPath());
    const serviceRequestRepository = new ServiceRequestRepository(getDbPath());
    try {
        const dashboardService = new DashboardService(residentRepository, serviceRequestRepository);
        const summary = dashboardService.getDashboardSummary();
        res.render("dashboard/index", { summary });
    } finally {
        residentRepository.close();
        serviceRequestRepository.close();
    }
}
