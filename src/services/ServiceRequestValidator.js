export class ServiceRequestValidator {
    validate(serviceRequest) {
        const errors = [];

        // id must be unassigned (null) for a new submission
        if (serviceRequest.id !== null && serviceRequest.id !== undefined) {
            errors.push("id");
        }

        // residentId must be a positive number
        if (
            serviceRequest.residentId === null ||
            serviceRequest.residentId === undefined ||
            typeof serviceRequest.residentId !== "number" ||
            !Number.isInteger(serviceRequest.residentId) ||
            serviceRequest.residentId <= 0
        ) {
            errors.push("residentId");
        }

        // serviceType must be non-blank
        if (this.isBlank(serviceRequest.serviceType)) {
            errors.push("serviceType");
        }

        // description must be non-blank
        if (this.isBlank(serviceRequest.description)) {
            errors.push("description");
        }

        // dateRequested must be a valid YYYY-MM-DD string
        if (!this.isValidDate(serviceRequest.dateRequested)) {
            errors.push("dateRequested");
        }

        // status must be Pending for a new submission
        if (serviceRequest.status !== "Pending") {
            errors.push("status");
        }

        return errors;
    }

    isBlank(value) {
        return (
            typeof value !== "string" ||
            value.trim().length === 0
        );
    }

    isValidDate(value) {
        if (typeof value !== "string") return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(value);
        return !isNaN(date.getTime());
    }
}
