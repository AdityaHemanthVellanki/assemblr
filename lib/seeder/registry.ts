import { SyntheticEntity } from "./types";
import { writeFile } from "fs/promises";
import path from "path";

export class EntityRegistry {
    private entities: SyntheticEntity[] = [];

    add(entity: SyntheticEntity) {
        this.entities.push(entity);
    }

    get(type: string): SyntheticEntity[] {
        return this.entities.filter(e => e.type === type);
    }

    // Helper to pick a random entity of a type (for linking)
    getRandom(type: string): SyntheticEntity | undefined {
        const candidates = this.get(type);
        if (candidates.length === 0) return undefined;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    async saveManifest(orgId: string, runId: string) {
        const manifestPath = path.resolve(process.cwd(), `seeder-manifest-${orgId}-${runId}.json`);
        await writeFile(manifestPath, JSON.stringify(this.entities, null, 2));
        return manifestPath;
    }
}
