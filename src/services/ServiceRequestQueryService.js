const SUPPORTED_STATUSES = new Set([
    "Pending",
    "In Progress",
    "Completed",
    "Cancelled"
]);

export default class ServiceRequestQueryService {
    constructor(serviceRequestRepository) {
        this.serviceRequestRepository = serviceRequestRepository;
    }

    listServiceRequests() {
        return this.serviceRequestRepository.findAll();
    }

    viewServiceRequest(serviceRequestId) {
        return this.serviceRequestRepository.findById(serviceRequestId);
    }

    searchServiceRequests(searchTerm = "", statusFilter = "") {
        const normalizedSearch = typeof searchTerm === "string" ? searchTerm.trim() : "";
        const normalizedStatus = typeof statusFilter === "string" ? statusFilter.trim() : "";

        // Validate status filter if provided
        if (normalizedStatus.length > 0 && !SUPPORTED_STATUSES.has(normalizedStatus)) {
            return {
                success: false,
                results: [],
                unsupportedStatus: true
            };
        }

        // Blank search + no filter = list all
        if (normalizedSearch.length === 0 && normalizedStatus.length === 0) {
            return {
                success: true,
                results: this.serviceRequestRepository.findAll(),
                unsupportedStatus: false
            };
        }

        return {
            success: true,
            results: this.serviceRequestRepository.searchAndFilter(normalizedSearch, normalizedStatus),
            unsupportedStatus: false
        };
    }
}
