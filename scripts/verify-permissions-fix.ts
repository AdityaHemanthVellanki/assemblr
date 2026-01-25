
import { requireOrgMember, OrgRole, getRequestContext } from "@/lib/permissions";

async function verifyPermissions() {
  console.log("Verifying permissions exports...");
  
  if (typeof requireOrgMember !== "function") {
    throw new Error("requireOrgMember is not a function");
  }
  
  if (typeof getRequestContext !== "function") {
    throw new Error("getRequestContext is not a function");
  }
  
  console.log("Exports look correct.");
}

verifyPermissions();
