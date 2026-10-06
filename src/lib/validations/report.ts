import { z } from "zod";

/**
 * Report type enum - represents the type of item report
 */
export const ReportType = {
  LOST: "LOST",
  FOUND: "FOUND",
} as const;

export type ReportType = (typeof ReportType)[keyof typeof ReportType];

/**
 * Category enum - common item categories for lost/found items
 */
export const ReportCategory = {
  ELECTRONICS: "Electronics",
  WALLET: "Wallet",
  KEYS: "Keys",
  BAG: "Bag",
  DOCUMENT: "Document",
  CLOTHING: "Clothing",
  OTHER: "Other",
} as const;

export type ReportCategory = (typeof ReportCategory)[keyof typeof ReportCategory];

/**
 * Report status enum
 */
export const ReportStatus = {
  PENDING: "PENDING",
  MATCHED: "MATCHED",
  RESOLVED: "RESOLVED",
  EXPIRED: "EXPIRED",
} as const;

export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

/**
 * Schema for validating the dateOccurred field.
 * Accepts any string Date.parse understands; empty strings are treated as
 * absent so the client can simply omit the field or send "".
 */
export const DateSchema = z.string().refine((val) => val === "" || !isNaN(Date.parse(val)), {
  message: "Invalid date format",
});

/**
 * Zod schema for validating report creation input.
 *
 * Validation rules:
 * - type: Required, must be LOST or FOUND
 * - title: Required, 1-200 characters (trimmed)
 * - description: Optional, max 2000 characters
 * - category: Required, must be a valid category
 * - location: Required, 1-500 characters (trimmed)
 * - dateOccurred: Optional, must be a valid date string if provided
 */
export const ReportSchema = z.object({
  type: z.enum(["LOST", "FOUND"]),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or less"),
  description: z.string().max(2000, "Description must be 2000 characters or less").optional(),
  category: z.enum(["Electronics", "Wallet", "Keys", "Bag", "Document", "Clothing", "Other"]),
  location: z
    .string()
    .trim()
    .min(1, "Location is required")
    .max(500, "Location must be 500 characters or less"),
  // Must parse as a real date when provided (empty string treated as absent)
  dateOccurred: DateSchema.optional(),
});

export type ReportInput = z.infer<typeof ReportSchema>;

/**
 * Validates report input and returns parsed data or throws an error.
 */
export function validateReport(input: unknown): ReportInput {
  return ReportSchema.parse(input);
}
