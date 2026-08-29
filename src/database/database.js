import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path) {
    return new DatabaseSync(path);
}