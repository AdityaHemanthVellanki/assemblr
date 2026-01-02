import { JoinDefinition } from "./store";

export type JoinStats = {
  leftRows: number;
  rightRows: number;
  matchedRows: number;
  droppedRows: number;
};

export type JoinedResult = {
  data: any[];
  stats: JoinStats;
};

// Phase 12: In-memory join executor
// Enforce strict limits
const MAX_ROWS_PER_SIDE = 10000;

export function executeJoin(
  joinDef: JoinDefinition,
  leftData: any[],
  rightData: any[]
): JoinedResult {
  // 1. Safety Checks
  if (leftData.length > MAX_ROWS_PER_SIDE || rightData.length > MAX_ROWS_PER_SIDE) {
    throw new Error(`Join blocked: Input size exceeds limit of ${MAX_ROWS_PER_SIDE} rows.`);
  }

  // 2. Index Right Side (Hash Join)
  const rightIndex = new Map<string, any[]>();
  for (const row of rightData) {
    const key = String(row[joinDef.rightField] || "");
    if (!rightIndex.has(key)) {
      rightIndex.set(key, []);
    }
    rightIndex.get(key)!.push(row);
  }

  const result: any[] = [];
  let matched = 0;

  // 3. Iterate Left
  for (const leftRow of leftData) {
    const key = String(leftRow[joinDef.leftField] || "");
    const matches = rightIndex.get(key);

    if (matches && matches.length > 0) {
      // Match found
      for (const rightRow of matches) {
        result.push({
          ...leftRow,
          ...prefixKeys(rightRow, "joined_") // Namespace right side
        });
        matched++;
      }
    } else if (joinDef.joinType === "left") {
      // Left Join: Keep left row even if no match
      result.push({ ...leftRow });
    }
    // Inner join drops row if no match
  }

  return {
    data: result,
    stats: {
      leftRows: leftData.length,
      rightRows: rightData.length,
      matchedRows: matched,
      droppedRows: leftData.length - matched // Approx for inner
    }
  };
}

function prefixKeys(obj: any, prefix: string): any {
  const newObj: any = {};
  for (const key in obj) {
    newObj[`${prefix}${key}`] = obj[key];
  }
  return newObj;
}
