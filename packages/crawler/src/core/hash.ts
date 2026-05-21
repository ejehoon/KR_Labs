import { createHash } from "node:crypto";

export function hashContent(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}
