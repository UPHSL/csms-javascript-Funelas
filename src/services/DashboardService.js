export default class DashboardService {
    constructor(residentRepository, serviceRequestRepository) {
        this.residentRepository = residentRepository;
        this.serviceRequestRepository = serviceRequestRepository;
    }

    getDashboardSummary() {
        // Resident counts
        const totalResidents    = this.residentRepository.countAll();
        const activeResidents   = this.residentRepository.countByStatus("Active");
        const inactiveResidents = this.residentRepository.countByStatus("Inactive");

        // Service Request counts
        const totalServiceRequests     = this.serviceRequestRepository.countAll();
        const pendingRequests          = this.serviceRequestRepository.countByStatus("Pending");
        const inProgressRequests       = this.serviceRequestRepository.countByStatus("In Progress");
        const completedRequests        = this.serviceRequestRepository.countByStatus("Completed");
        const cancelledRequests        = this.serviceRequestRepository.countByStatus("Cancelled");

        // Derived metric
        const openServiceRequests = pendingRequests + inProgressRequests;

        // Recent Service Requests
        const recentServiceRequests = this.serviceRequestRepository.findRecent(5);

        return {
            residents: {
                total:    totalResidents,
                active:   activeResidents,
                inactive: inactiveResidents
            },
            serviceRequests: {
                total:      totalServiceRequests,
                pending:    pendingRequests,
                inProgress: inProgressRequests,
                completed:  completedRequests,
                cancelled:  cancelledRequests,
                open:       openServiceRequests
            },
            recentServiceRequests
        };
    }
}
