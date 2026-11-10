import { Router } from "express";

import { showHealth } from "../controllers/healthController.js";
import { showHome } from "../controllers/homeController.js";
import {
    listResidents,
    showRegisterForm,
    registerResident,
    showEditForm,
    updateResident,
    deactivateResident
} from "../controllers/residentController.js";

const router = Router();

router.get("/", showHome);
router.get("/health", showHealth);

// Resident Management
router.get("/residents",                listResidents);
router.get("/residents/register",       showRegisterForm);
router.post("/residents/register",      registerResident);
router.get("/residents/:id/edit",       showEditForm);
router.post("/residents/:id/edit",      updateResident);
router.post("/residents/:id/deactivate", deactivateResident);

export default router;
