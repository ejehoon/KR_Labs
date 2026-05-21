import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

let cachedClient: SupabaseClient | undefined;

export function createSupabaseAdmin(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !url ? "SUPABASE_URL" : undefined,
    !key ? "SUPABASE_SERVICE_ROLE_KEY" : undefined,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase environment variable(s): ${missing.join(", ")}. ` +
        "Create .env from .env.example and set service-role credentials before running DB-backed commands.",
    );
  }

  if (!url || !key) {
    throw new Error("Supabase credentials are missing.");
  }

  cachedClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket as any,
    },
  });

  return cachedClient;
}
