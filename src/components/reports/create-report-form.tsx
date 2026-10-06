"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createReport, ApiError } from "@/lib/api/reports";
import {
  validateImageFile,
  presignUpload,
  uploadToS3,
  attachImage,
  MAX_FILE_SIZE,
} from "@/lib/api/uploads";
import { ReportSchema, type ReportInput } from "@/lib/validations/report";
import { Loader2, PlusCircle, CheckCircle2, AlertTriangle, X } from "lucide-react";

const CATEGORIES = [
  "Electronics",
  "Wallet",
  "Keys",
  "Bag",
  "Document",
  "Clothing",
  "Other",
] as const;

type FormState = {
  type: "LOST" | "FOUND";
  title: string;
  description: string;
  category: string;
  location: string;
  dateOccurred: string;
};

const INITIAL_FORM: FormState = {
  type: "LOST",
  title: "",
  description: "",
  category: "Other",
  location: "",
  dateOccurred: "",
};

/** Upload lifecycle shown to the user. */
type UploadPhase = "idle" | "uploading" | "done";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreateReportForm({ onCreated }: { onCreated?: () => void }) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Image state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setSuccess(false);
    setApiError(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFileError(null);
    setSuccess(false);

    if (!selected) {
      clearFile();
      return;
    }

    const error = validateImageFile(selected);
    if (error) {
      setFileError(error);
      clearFile();
      // Reset the input so the same invalid file can be re-picked
      e.target.value = "";
      return;
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setUploadPhase("idle");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(false);
    setApiError(null);

    // Client-side validation using the shared Zod schema
    const parsed = ReportSchema.safeParse({
      ...form,
      description: form.description || undefined,
      dateOccurred: form.dateOccurred || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create the report first (server generates the ID)
      const created = await createReport(parsed.data as ReportInput);

      // 2. If an image is selected: presign → direct S3 upload → PATCH
      if (file) {
        setUploadPhase("uploading");
        try {
          const { uploadUrl, imageKey } = await presignUpload(created.id, file);
          await uploadToS3(uploadUrl, file);
          await attachImage(created.id, imageKey);
        } catch (uploadErr) {
          // The report itself was created; surface the image failure clearly
          setUploadPhase("idle");
          setSuccess(true);
          setForm(INITIAL_FORM);
          clearFile();
          onCreated?.();
          setApiError(
            uploadErr instanceof ApiError && uploadErr.status === 401
              ? "Report created, but your session expired before the image could be uploaded."
              : "Report created, but the image upload failed. You can try again later.",
          );
          return;
        }
      }

      setUploadPhase("idle");
      setSuccess(true);
      setForm(INITIAL_FORM);
      clearFile();
      onCreated?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setApiError("Your session has expired. Please sign in again.");
      } else if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a report</CardTitle>
        <CardDescription>
          Report a lost item or something you found so it can be matched with its owner.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {success && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Report created successfully.</span>
          </div>
        )}

        {apiError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{apiError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Type */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Type</legend>
            <div className="flex gap-2">
              {(["LOST", "FOUND"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={form.type === t}
                  onClick={() => update("type", t)}
                  disabled={busy}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    form.type === t
                      ? t === "LOST"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t === "LOST" ? "I lost an item" : "I found an item"}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g., Black MacBook Pro charger"
              maxLength={200}
              disabled={busy}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "title-error" : undefined}
            />
            {errors.title && (
              <p id="title-error" className="text-xs text-destructive">
                {errors.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Add details like color, brand, contents..."
              rows={3}
              maxLength={2000}
              disabled={busy}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
          </div>

          {/* Category + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">
                Category <span aria-hidden="true">*</span>
              </Label>
              <select
                id="category"
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                disabled={busy}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dateOccurred">Date occurred</Label>
              <Input
                id="dateOccurred"
                type="date"
                value={form.dateOccurred}
                onChange={(e) => update("dateOccurred", e.target.value)}
                disabled={busy}
                aria-invalid={!!errors.dateOccurred}
              />
              {errors.dateOccurred && (
                <p className="text-xs text-destructive">{errors.dateOccurred}</p>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="location">
              Location <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
              placeholder="e.g., Library, 2nd floor study room"
              maxLength={500}
              disabled={busy}
              aria-invalid={!!errors.location}
              aria-describedby={errors.location ? "location-error" : undefined}
            />
            {errors.location && (
              <p id="location-error" className="text-xs text-destructive">
                {errors.location}
              </p>
            )}
          </div>

          {/* Image (optional) */}
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-sm font-medium">Photo (optional)</legend>

            {!file ? (
              <div className="space-y-1.5">
                <Label htmlFor="image" className="sr-only">
                  Select an image
                </Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
                />
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG, or WebP · up to {formatBytes(MAX_FILE_SIZE)}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border p-3">
                {previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img
                    src={previewUrl}
                    alt={`Preview of ${file.name}`}
                    className="h-16 w-16 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  {uploadPhase === "uploading" && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-primary">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Uploading...
                    </p>
                  )}
                  {uploadPhase === "done" && (
                    <p className="mt-1 text-xs text-green-700 dark:text-green-400">
                      Upload complete
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={clearFile}
                  disabled={busy}
                  aria-label="Remove selected image"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}

            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </fieldset>

          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {uploadPhase === "uploading" ? "Uploading image..." : "Creating..."}
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                Create report
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
