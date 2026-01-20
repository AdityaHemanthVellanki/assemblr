
import { NextResponse } from "next/server";

export type ApiResponse<T> = 
  | { ok: true; data: T }
  | { ok: false; error: string; details?: any };

export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function errorResponse(message: string, status: number = 500, details?: any): NextResponse {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}
