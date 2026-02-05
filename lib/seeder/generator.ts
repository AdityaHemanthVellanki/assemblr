import { faker } from "@faker-js/faker";

export class DataGenerator {
    seed(val: number) {
        faker.seed(val);
    }

    repoName() {
        return "SE_" + faker.word.adjective() + "-" + faker.word.noun();
    }

    commitMessage() {
        const action = faker.helpers.arrayElement(["fix", "feat", "chore", "perf", "refactor"]);
        const scope = faker.helpers.arrayElement(["auth", "ui", "api", "db", "core"]);
        return `${action}(${scope}): ${faker.hacker.verb()} ${faker.hacker.noun()}`;
    }

    issueTitle() {
        return faker.hacker.phrase();
    }

    prTitle() {
        return `${faker.word.verb()} ${faker.hacker.adjective()} ${faker.hacker.noun()}`;
    }

    technobabble() {
        return faker.hacker.phrase() + " " + faker.company.catchPhrase();
    }

    // Temporal Helpers
    pastDate(daysAgo: number) {
        return faker.date.recent({ days: daysAgo });
    }
}

export const gen = new DataGenerator();
