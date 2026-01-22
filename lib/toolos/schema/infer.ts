
import { EntitySpec } from "@/lib/toolos/spec";

export function inferFieldsFromData(data: any): EntitySpec["fields"] {
  if (!data) return [];
  
  // If array, inspect first few items to find common fields
  const items = Array.isArray(data) ? data : [data];
  if (items.length === 0) return [];

  const fieldMap = new Map<string, { type: string; required: boolean; count: number }>();
  
  // Sample up to 10 items
  const sample = items.slice(0, 10);
  
  for (const item of sample) {
    if (typeof item !== "object" || item === null) continue;
    
    for (const [key, value] of Object.entries(item)) {
      const type = inferType(value);
      const existing = fieldMap.get(key);
      
      if (existing) {
        existing.count++;
        if (existing.type !== type && type !== "null") {
            // If mixed types, default to string unless one is null
            existing.type = "string";
        }
      } else {
        fieldMap.set(key, { type, required: true, count: 1 });
      }
    }
  }

  // Determine required status
  for (const [key, info] of fieldMap.entries()) {
    // If field appeared in all samples, it's likely required. 
    // But strict requiredness is risky from just a sample.
    // Let's relax it: Only required if it's "id" or similar.
    const isId = key.toLowerCase() === "id" || key.toLowerCase().endsWith("_id");
    info.required = isId && info.count === sample.length;
  }

  return Array.from(fieldMap.entries()).map(([name, info]) => ({
    name,
    type: info.type,
    required: info.required
  }));
}

function inferType(value: any): string {
  if (value === null || value === undefined) return "string"; // Default to string for nulls
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}
