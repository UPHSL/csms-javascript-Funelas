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
    findAll() {
        const stmt = this.db.prepare(`
            SELECT id, resident_id, service_type, description, date_requested, status
            FROM service_requests
            ORDER BY
                date_requested DESC,
                id DESC
        `);
        const rows = stmt.all();
        return rows.map((row) => this._mapRowToServiceRequest(row));
    }

    searchAndFilter(searchTerm, statusFilter) {
        const params = [];
        const conditions = [];

        // Text search condition
        if (searchTerm && searchTerm.trim().length > 0) {
            const pattern = `%${searchTerm.trim()}%`;
            conditions.push(`(LOWER(service_type) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))`);
            params.push(pattern, pattern);
        }

        // Status filter condition
        if (statusFilter && statusFilter.trim().length > 0) {
            conditions.push(`status = ?`);
            params.push(statusFilter.trim());
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const stmt = this.db.prepare(`
            SELECT id, resident_id, service_type, description, date_requested, status
            FROM service_requests
            ${where}
            ORDER BY
                date_requested DESC,
                id DESC
        `);

        const rows = stmt.all(...params);
        return rows.map((row) => this._mapRowToServiceRequest(row));
    }

    close() {
        this.db.close();
    }
}
