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
import { categoryLabel } from "@/lib/i18n/vi";

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

export function CreateReportForm({ onCreatedAction }: { onCreatedAction?: () => void }) {
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
          onCreatedAction?.();
          setApiError(
            uploadErr instanceof ApiError && uploadErr.status === 401
              ? "Report created, but your session expired before the image could be uploaded."
              : "Không thể tải ảnh lên. Bạn có thể thử lại sau.",
          );
          return;
        }
      }

      setUploadPhase("idle");
      setSuccess(true);
      setForm(INITIAL_FORM);
      clearFile();
      onCreatedAction?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setApiError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      } else if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError("Đã xảy ra lỗi. Vui lòng thử lại.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tạo tin báo</CardTitle>
        <CardDescription>
          Báo cáo đồ bị mất hoặc đồ nhặt được để có thể ghép với chủ nhân.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {success && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Tin báo đã được tạo thành công.</span>
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
            <legend className="text-sm font-medium">Loại tin</legend>
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
                  {t === "LOST" ? "Báo đồ bị mất" : "Báo đồ nhặt được"}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Tiêu đề <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="VD: Sạc MacBook Pro màu đen"
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
            <Label htmlFor="description">Mô tả</Label>
            <textarea
              id="description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Thêm chi tiết như màu sắc, nhãn hiệu, đồ bên trong..."
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
                Danh mục <span aria-hidden="true">*</span>
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
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
              {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dateOccurred">Ngày xảy ra</Label>
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
              Địa điểm <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
              placeholder="VD: Thư viện, phòng tự học tầng 2"
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
            <legend className="text-sm font-medium">Ảnh (không bắt buộc)</legend>

            {!file ? (
              <div className="space-y-1.5">
                <Label htmlFor="image" className="sr-only">
                  Chọn ảnh
                </Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
                />
                <p className="text-xs text-muted-foreground">
                  JPEG, PNG hoặc WebP · tối đa {formatBytes(MAX_FILE_SIZE)}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border p-3">
                {previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                  <img
                    src={previewUrl}
                    alt={`Xem trước ảnh ${file.name}`}
                    className="h-16 w-16 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                  {uploadPhase === "uploading" && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-primary">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      Đang tải lên...
                    </p>
                  )}
                  {uploadPhase === "done" && (
                    <p className="mt-1 text-xs text-green-700 dark:text-green-400">
                      Tải lên xong
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={clearFile}
                  disabled={busy}
                  aria-label="Xóa ảnh đã chọn"
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
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadPhase === "uploading" ? "Đang tải ảnh..." : "Đang tạo..."}
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                Đăng tin
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
