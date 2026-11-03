import { z } from "zod";

const uuid = z.string().uuid();

/** True for a well-formed UUID. v1 [id] routes return 404 for anything else. */
export function isUuid(value: string): boolean {
  return uuid.safeParse(value).success;
}
