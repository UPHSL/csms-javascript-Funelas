export default class ServiceRequestSubmissionService {
    constructor(validator, residentRepository, serviceRequestRepository) {
        this.validator = validator;
        this.residentRepository = residentRepository;
        this.serviceRequestRepository = serviceRequestRepository;
    }

    submitRequest(serviceRequest) {
        // 1. Validate intrinsic Service Request information
        const errors = this.validator.validate(serviceRequest);
        if (errors.length > 0) {
            return {
                success: false,
                serviceRequest: null,
                errors,
                residentNotFound: false,
                residentInactive: false
            };
        }

        // 2. Verify the Resident exists
        const resident = this.residentRepository.findById(serviceRequest.residentId);
        if (!resident) {
            return {
                success: false,
                serviceRequest: null,
                errors: [],
                residentNotFound: true,
                residentInactive: false
            };
        }

        // 3. Verify the Resident is Active
        if (resident.status !== "Active") {
            return {
                success: false,
                serviceRequest: null,
                errors: [],
                residentNotFound: false,
                residentInactive: true
            };
        }

        // 4. Persist the Service Request
        const persisted = this.serviceRequestRepository.save(serviceRequest);

        return {
            success: true,
            serviceRequest: persisted,
            errors: [],
            residentNotFound: false,
            residentInactive: false
        };
    }
}
