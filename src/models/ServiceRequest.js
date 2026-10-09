/**
 * Service-request domain-model placeholder.
 *
 * Service-request behavior will be introduced through a future CSMS ticket.
 */
export class ServiceRequest {
    constructor({
        id = null,
        residentId,
        serviceType,
        description,
        dateRequested,
        status = "Pending"
    }) {
        this.id = id;
        this.residentId = residentId;
        this.serviceType = serviceType;
        this.description = description;
        this.dateRequested = dateRequested;
        this.status = status;
    }
}
