export default class ResidentQueryService {
    constructor(repository) {
        this.repository = repository;
    }

    listResidents() {
        return this.repository.findAll();
    }

    searchResidents(searchTerm) {
        const normalizedSearchTerm =
            typeof searchTerm === "string"
                ? searchTerm.trim()
                : "";

        if (normalizedSearchTerm.length === 0) {
            return this.listResidents();
        }

        return this.repository.searchByName(normalizedSearchTerm);
    }
}
