const SUPPORTED_STATUSES = new Set([
    "Pending",
    "In Progress",
    "Completed",
    "Cancelled"
]);

const ALLOWED_TRANSITIONS = new Map([
    ["Pending",     new Set(["In Progress", "Cancelled"])],
    ["In Progress", new Set(["Completed",   "Cancelled"])],
    ["Completed",   new Set()],
    ["Cancelled",   new Set()]
]);

export default class ServiceRequestStatusService {
    constructor(serviceRequestRepository) {
        this.serviceRequestRepository = serviceRequestRepository;
    }

    manageStatus(serviceRequestId, requestedStatus) {
        // 1. Retrieve the existing Service Request
        const existing = this.serviceRequestRepository.findById(serviceRequestId);

        if (!existing) {
            return {
                success: false,
                serviceRequest: null,
                notFound: true,
                unsupportedStatus: false,
                invalidTransition: false
            };
        }

        // 2. Check whether requested status is supported
        if (!SUPPORTED_STATUSES.has(requestedStatus)) {
            return {
                success: false,
                serviceRequest: null,
                notFound: false,
                unsupportedStatus: true,
                invalidTransition: false
            };
        }

        // 3. Check whether the transition is allowed
        const allowedTargets = ALLOWED_TRANSITIONS.get(existing.status);
        if (!allowedTargets || !allowedTargets.has(requestedStatus)) {
            return {
                success: false,
                serviceRequest: null,
                notFound: false,
                unsupportedStatus: false,
                invalidTransition: true
            };
        }

        // 4. Persist the status change
        const updated = this.serviceRequestRepository.updateStatus(serviceRequestId, requestedStatus);

        return {
            success: true,
            serviceRequest: updated,
            notFound: false,
            unsupportedStatus: false,
            invalidTransition: false
        };
    }
}
