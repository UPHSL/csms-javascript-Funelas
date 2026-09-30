export function migrate(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            address TEXT NOT NULL,
            contact_number TEXT NOT NULL,
            email TEXT NOT NULL,
            status TEXT NOT NULL
        ) STRICT
        `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS service_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id INTEGER NOT NULL,
            service_type TEXT NOT NULL,
            description TEXT NOT NULL,
            date_requested TEXT NOT NULL,
            status TEXT NOT NULL
        ) STRICT
    `);
}