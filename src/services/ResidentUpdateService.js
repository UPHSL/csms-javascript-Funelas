export default class ResidentUpdateService {
    constructor(validator, repository) {
        this.validator = validator;
        this.repository = repository;
    }

    updateResident(residentId, proposedInfo) {
        // 1. Look up the existing Resident
        const existing = this.repository.findById(residentId);

        if (!existing) {
            return {
                success: false,
                resident: null,
                errors: [],
                notFound: true
            };
        }

        // 2. Build the update candidate — preserve id and status
        const candidate = {
            id: existing.id,
            firstName: proposedInfo.firstName,
            lastName: proposedInfo.lastName,
            address: proposedInfo.address,
            contactNumber: proposedInfo.contactNumber,
            email: proposedInfo.email,
            status: existing.status
        };

        // 3. Validate using the existing T02 validator
        const errors = this.validator.validate(candidate);

        if (errors.length > 0) {
            return {
                success: false,
                resident: null,
                errors,
                notFound: false
            };
        }

        // 4. Persist the permitted changes
        const updatedResident = this.repository.update(candidate);

        return {
            success: true,
            resident: updatedResident,
            errors: [],
            notFound: false
        };
    }
}
