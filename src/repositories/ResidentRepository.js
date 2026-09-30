/**
 * Resident persistence placeholder.
 *
 * Persistence behavior will be introduced through a future CSMS ticket.
 */
import { Resident } from '../models/Resident.js';
import { openDatabase } from '../database/database.js';
import { migrate } from '../database/migrate.js';

export class ResidentRepository {
    constructor(dbPath) {
        this.db = openDatabase(dbPath);
        migrate(this.db);
    }

    _mapRowToResident(row) {
        return new Resident({
            id: Number(row.id),
            firstName: row.first_name,
            lastName: row.last_name,
            address: row.address,
            contactNumber: row.contact_number,
            email: row.email,
            status: row.status
        });
    }

    save(resident) {
        const stmt = this.db.prepare(`
            INSERT INTO residents(first_name, last_name, address, contact_number, email, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            resident.firstName,
            resident.lastName,
            resident.address,
            resident.contactNumber,
            resident.email,
            resident.status
        );
        resident.id = Number(result.lastInsertRowid);
        return resident;
    }

    findById(residentId) {
        const stmt = this.db.prepare(`
            SELECT id, first_name, last_name, address, contact_number, email, status
            FROM residents
            WHERE id = ?
        `);
        const row = stmt.get(residentId);
        if (!row) return null;
        return this._mapRowToResident(row);
    }

    findAll() {
        const stmt = this.db.prepare(`
            SELECT id, first_name, last_name, address, contact_number, email, status
            FROM residents
            ORDER BY
                LOWER(last_name) ASC,
                LOWER(first_name) ASC,
                id ASC
        `);
        const rows = stmt.all();
        return rows.map((row) => this._mapRowToResident(row));
    }

    searchByName(searchTerm) {
        const stmt = this.db.prepare(`
            SELECT id, first_name, last_name, address, contact_number, email, status
            FROM residents
            WHERE
                LOWER(first_name) LIKE LOWER(?)
                OR LOWER(last_name) LIKE LOWER(?)
            ORDER BY
                LOWER(last_name) ASC,
                LOWER(first_name) ASC,
                id ASC
        `);
        const pattern = `%${searchTerm}%`;
        const rows = stmt.all(pattern, pattern);
        return rows.map((row) => this._mapRowToResident(row));
    }

    close() {
        this.db.close();
    }
}
