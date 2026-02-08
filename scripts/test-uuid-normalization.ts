
import { normalizeUUID } from "../lib/utils";

console.log("Running UUID Normalization Tests...");

const tests = [
  { input: "123e4567-e89b-12d3-a456-426614174000", expected: "123e4567-e89b-12d3-a456-426614174000", name: "Valid UUID" },
  { input: "null", expected: null, name: "String 'null'" },
  { input: "undefined", expected: null, name: "String 'undefined'" },
  { input: "", expected: null, name: "Empty string" },
  { input: "   ", expected: null, name: "Whitespace string" },
  { input: null, expected: null, name: "Actual null" },
  { input: undefined, expected: null, name: "Actual undefined" },
  { input: "not-a-uuid", expected: null, name: "Invalid string" },
  { input: "12345", expected: null, name: "Short number string" },
  { input: 12345, expected: null, name: "Number type" },
];

let failed = 0;

tests.forEach(t => {
  const result = normalizeUUID(t.input as string);
  if (result === t.expected) {
    console.log(`✅ ${t.name}: passed`);
  } else {
    console.error(`❌ ${t.name}: failed. Expected ${t.expected}, got ${result}`);
    failed++;
  }
});

if (failed > 0) {
  console.error(`\n${failed} tests failed.`);
  process.exit(1);
} else {
  console.log("\nAll tests passed!");
  process.exit(0);
}
