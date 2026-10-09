import { ServiceRequest } from '../models/ServiceRequest.js';
import { openDatabase } from '../database/database.js';
import { migrate } from '../database/migrate.js';

export class ServiceRequestRepository {
    constructor(dbPath) {
        this.db = openDatabase(dbPath);
        migrate(this.db);
    }

    _mapRowToServiceRequest(row) {
        return new ServiceRequest({
            id: Number(row.id),
            residentId: Number(row.resident_id),
            serviceType: row.service_type,
            description: row.description,
            dateRequested: row.date_requested,
            status: row.status
        });
    }

    save(serviceRequest) {
        const stmt = this.db.prepare(`
            INSERT INTO service_requests (resident_id, service_type, description, date_requested, status)
            VALUES (?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            serviceRequest.residentId,
            serviceRequest.serviceType,
            serviceRequest.description,
            serviceRequest.dateRequested,
            serviceRequest.status
        );
        serviceRequest.id = Number(result.lastInsertRowid);
        return serviceRequest;
    }

    findById(serviceRequestId) {
        const stmt = this.db.prepare(`
            SELECT id, resident_id, service_type, description, date_requested, status
            FROM service_requests
            WHERE id = ?
        `);
        const row = stmt.get(serviceRequestId);
        if (!row) return null;
        return this._mapRowToServiceRequest(row);
    }
    updateStatus(serviceRequestId, newStatus) {
        const stmt = this.db.prepare(`
            UPDATE service_requests
            SET status = ?
            WHERE id = ?
        `);
        stmt.run(newStatus, serviceRequestId);
        return this.findById(serviceRequestId);
    }

    count() {
        const stmt = this.db.prepare(`SELECT COUNT(*) as total FROM service_requests`);
        const row = stmt.get();
        return Number(row.total);
    }

    close() {
        this.db.close();
    }
}
