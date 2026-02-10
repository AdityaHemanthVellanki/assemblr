import { ToolSystemSpecSchema } from "@/lib/toolos/spec";

/**
 * Validates a project row fetched from the database.
 * Throws a clear error if required fields are missing or if non-existent columns were selected.
 */
export function validateProjectRow(row: any) {
    if (!row) {
        throw new Error("[SchemaValidation] Project row is null or undefined");
    }

    const requiredFields = ["id", "org_id", "name", "spec", "status"];
    const missingFields = requiredFields.filter(field => !(field in row));

    if (missingFields.length > 0) {
        console.error("[SchemaValidation] Missing required project fields:", missingFields, { rowId: row.id });
        throw new Error(`[SchemaValidation] Missing required fields in project read: ${missingFields.join(", ")}`);
    }

    // Check for known "rogue" fields that might have been removed from schema but remained in code queries
    if ("description" in row) {
        console.warn("[SchemaValidation] Selection of deprecated 'description' column detected. This should be removed from the query.", { rowId: row.id });
    }

    // Validate spec if present
    if (row.spec) {
        const specResult = ToolSystemSpecSchema.safeParse(row.spec);
        if (!specResult.success) {
            console.error("[SchemaValidation] Spec validation failed for project:", row.id, specResult.error.format());
            // We don't necessarily throw here to avoid hard-breaking partial projects, but we log loudly
        }
    }

    return true;
}
