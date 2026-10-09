import { z } from "zod";

/**
 * Validation for public report search query parameters.
 * All filters are optional; unknown/invalid values are rejected.
 */
export const SearchQuerySchema = z.object({
  type: z.enum(["LOST", "FOUND"]).optional(),
  category: z
    .enum(["Electronics", "Wallet", "Keys", "Bag", "Document", "Clothing", "Other"])
    .optional(),
  status: z.enum(["PENDING", "MATCHED", "RESOLVED", "EXPIRED"]).optional(),
  location: z.string().trim().max(200, "Bộ lọc địa điểm quá dài").optional(),
  search: z.string().trim().max(100, "Từ khóa quá dài").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().optional(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/**
 * Validates an id path parameter (UUID format).
 */
export const ReportIdSchema = z.string().uuid("Mã tin báo không hợp lệ");

/**
 * Parses and validates raw query params, returning null on invalid input.
 */
export function validateSearchQuery(params: URLSearchParams): SearchQuery | null {
  const raw = {
    type: params.get("type") ?? undefined,
    category: params.get("category") ?? undefined,
    status: params.get("status") ?? undefined,
    location: params.get("location") ?? undefined,
    search: params.get("search") ?? undefined,
    limit: params.get("limit") ?? undefined,
  };

  // Drop empty strings so optional fields stay unset
  for (const key of Object.keys(raw) as (keyof typeof raw)[]) {
    if (raw[key] === "") raw[key] = undefined;
  }

  const parsed = SearchQuerySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
