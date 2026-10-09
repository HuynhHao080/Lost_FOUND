"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateReport, ApiError } from "@/lib/api/reports";
import {
  validateImageFile,
  presignUpload,
  uploadToS3,
  attachImage,
  MAX_FILE_SIZE,
} from "@/lib/api/uploads";
import { ReportSchema } from "@/lib/validations/report";
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
  title: string;
  description: string;
  category: string;
  location: string;
  dateOccurred: string;
};

/** Upload lifecycle shown to the user. */
type UploadPhase = "idle" | "uploading" | "done";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EditReportForm({ report }: { report: import("@/lib/api/public-reports").PublicReport }) {
  const [form, setForm] = useState<FormState>({
    title: report.title || "",
    description: report.description || "",
    category: report.category || "Other",
    location: report.location || "",
    dateOccurred: report.dateOccurred || "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Image state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [hasExistingImage, setHasExistingImage] = useState(report.hasImage);
  const [existingImageKey, setExistingImageKey] = useState<string | null>(report.imageKey ?? null);

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

  const [errors, setErrors] = useState<Record<string, string>>({});

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

    // Client-side validation
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
      // 1. Update content fields first
      await updateReport(report.id, parsed.data);

      // 2. If an image is selected: presign → direct S3 upload → PATCH
      if (file) {
        setUploadPhase("uploading");
        try {
          const { uploadUrl, imageKey } = await presignUpload(report.id, file);
          await uploadToS3(uploadUrl, file);
          await attachImage(report.id, imageKey);
          setHasExistingImage(true);
          setExistingImageKey(imageKey);
        } catch (uploadErr) {
          // The report content was updated; surface the image failure clearly
          setUploadPhase("idle");
          setSuccess(true);
          setApiError(
            uploadErr instanceof ApiError && uploadErr.status === 401
              ? "Tin báo đã cập nhật, nhưng phiên đăng nhập hết hạn trước khi tải ảnh lên."
              : "Không thể tải ảnh lên. Bạn có thể thử lại sau.",
          );
          return;
        }
      }

      setUploadPhase("idle");
      setSuccess(true);
      clearFile();
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
        <CardTitle>Chỉnh sửa tin báo</CardTitle>
      </CardHeader>
      <CardContent>
        {success && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Đã cập nhật thành công.</span>
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

            {!file && !hasExistingImage ? (
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
                {(previewUrl || hasExistingImage) && (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview or presigned URL
                  <img
                    src={previewUrl || (hasExistingImage && existingImageKey ? `/api/reports/${report.id}/image` : "")}
                    alt={previewUrl ? `Xem trước ảnh ${file?.name}` : `Ảnh hiện tại của ${report.title}`}
                    className="h-16 w-16 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-medium">
                    {file ? file.name : hasExistingImage ? "Ảnh hiện tại" : ""}
                  </p>
                  {file && <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>}
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
                <div className="flex flex-col gap-1">
                  {file && (
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
                  )}
                  {hasExistingImage && !file && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setHasExistingImage(false);
                        setExistingImageKey(null);
                        // The image will be removed on next submit (imageKey not sent = keep existing)
                        // To actually remove, we'd need to send empty imageKey, but API doesn't support removal
                        // For now, just hide the preview
                      }}
                      disabled={busy}
                      aria-label="Xóa ảnh hiện tại"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </fieldset>

          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadPhase === "uploading" ? "Đang tải ảnh..." : "Đang lưu..."}
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                Lưu thay đổi
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}