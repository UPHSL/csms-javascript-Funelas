/**
 * Resident persistence placeholder.
 *
 * Persistence behavior will be introduced through a future CSMS ticket.
 */
import {Resident} from '../models/Resident.js';
import {openDatabase} from '../database/database.js';
import {migrate} from '../database/migrate.js';
export class ResidentRepository {
    constructor(dbPath) {
        this.db = openDatabase(dbPath);
        migrate(this.db);
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
            SELECT * FROM residents WHERE id = ?`
        );
        const row = stmt.get(residentId);
        if (!row) return null;
        return new Resident({
            id: row.id,
            firstName: row.first_name,
            lastName: row.last_name,
            address: row.address,
            contactNumber: row.contact_number,
            email: row.email,
            status: row.status
        });

    }
    close() {
        this.db.close();
    }
}