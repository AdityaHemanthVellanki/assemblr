
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/client";
import { PermissionError } from "@/lib/permissions-shared";

export type ApiResponse<T> = 
  | { ok: true; data: T }
  | { ok: false; error: string; details?: any };

export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function errorResponse(message: string, status: number = 500, details?: any): NextResponse {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

export function handleApiError(e: unknown): NextResponse {
  console.error("[API] Error:", e);
  const status =
    e instanceof ApiError
      ? e.status
      : e instanceof PermissionError
        ? e.status
        : 500;
  const message = e instanceof Error ? e.message : "Internal Server Error";
  return errorResponse(message, status);
}
