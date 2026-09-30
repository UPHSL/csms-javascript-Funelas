export default class ResidentDeactivationService {
    constructor(repository) {
        this.repository = repository;
    }

    deactivateResident(residentId) {
        // 1. Look up the existing Resident
        const existing = this.repository.findById(residentId);

        if (!existing) {
            return {
                success: false,
                resident: null,
                notFound: true,
                alreadyInactive: false
            };
        }

        // 2. Already Inactive — safe idempotent result
        if (existing.status === "Inactive") {
            return {
                success: true,
                resident: existing,
                notFound: false,
                alreadyInactive: true
            };
        }

        // 3. Active → Inactive
        const updatedResident = this.repository.deactivateById(residentId);

        return {
            success: true,
            resident: updatedResident,
            notFound: false,
            alreadyInactive: false
        };
    }
}
