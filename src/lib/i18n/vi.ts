/**
 * Bảng dịch tiếng Việt dùng chung cho toàn bộ frontend.
 * Enum kỹ thuật (LOST/FOUND, PENDING/MATCHED...) vẫn giữ nguyên trong DB/API,
 * chỉ chuyển label hiển thị sang tiếng Việt tại đây.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  Electronics: "Đồ điện tử",
  Wallet: "Ví",
  Keys: "Chìa khóa",
  Bag: "Túi xách",
  Document: "Giấy tờ",
  Clothing: "Quần áo",
  Other: "Khác",
};

/** Map ngược từ label tiếng Việt (landing page) về value kỹ thuật. */
export const CATEGORY_VALUE_FROM_LABEL: Record<string, string> = {
  "Điện tử": "Electronics",
  "Đồ điện tử": "Electronics",
  Ví: "Wallet",
  "Chìa khóa": "Keys",
  "Túi xách": "Bag",
  Túi: "Bag",
  "Giấy tờ": "Document",
  "Quần áo": "Clothing",
  Khác: "Other",
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "Đang tìm kiếm",
  MATCHED: "Đã khớp",
  RESOLVED: "Đã giải quyết",
  EXPIRED: "Đã hết hạn",
};

export const TYPE_LABELS: Record<string, string> = {
  LOST: "Đồ bị mất",
  FOUND: "Đồ nhặt được",
};

export const MATCH_LABELS: Record<string, string> = {
  "Khớp cao": "Khớp cao",
  "Có thể khớp": "Có thể khớp",
  "Khớp yếu": "Khớp yếu",
  "High match": "Khớp cao",
  "Possible match": "Có thể khớp",
  "Weak match": "Khớp yếu",
};

export const MATCH_REASON_LABELS: Record<string, string> = {
  "Cùng danh mục": "Cùng danh mục",
  "Cùng địa điểm": "Cùng địa điểm",
  "Xảy ra cùng ngày": "Xảy ra cùng ngày",
  "Xảy ra trong vòng 1 ngày": "Xảy ra trong vòng 1 ngày",
  "Xảy ra trong vòng 3 ngày": "Xảy ra trong vòng 3 ngày",
  "Xảy ra trong vòng 7 ngày": "Xảy ra trong vòng 7 ngày",
  "Mô tả rất giống nhau": "Mô tả rất giống nhau",
  "Mô tả khá giống nhau": "Mô tả khá giống nhau",
  "Mô tả hơi giống nhau": "Mô tả hơi giống nhau",
  "Nội dung rất tương đồng": "Nội dung rất tương đồng",
  "Nội dung khá tương đồng": "Nội dung khá tương đồng",
  "Nội dung hơi tương đồng": "Nội dung hơi tương đồng",
  "Khác địa điểm và thời gian": "Khác địa điểm và thời gian",
  "Địa điểm báo khác nhau": "Địa điểm báo khác nhau",
  "Same category": "Cùng danh mục",
  "Same location": "Cùng địa điểm",
  "Occurred on the same date": "Xảy ra cùng ngày",
  "Occurred within 1 day of each other": "Xảy ra trong vòng 1 ngày",
  "Occurred within 3 days of each other": "Xảy ra trong vòng 3 ngày",
  "Occurred within 7 days of each other": "Xảy ra trong vòng 7 ngày",
  "Strong description similarity": "Mô tả rất giống nhau",
  "Moderate description similarity": "Mô tả khá giống nhau",
  "Small description similarity": "Mô tả hơi giống nhau",
  "Strong semantic similarity": "Nội dung rất tương đồng",
  "Moderate semantic similarity": "Nội dung khá tương đồng",
  "Some semantic similarity": "Nội dung hơi tương đồng",
  "Different location and timing": "Khác địa điểm và thời gian",
  "Different locations reported": "Địa điểm báo khác nhau",
};

export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? CATEGORY_VALUE_FROM_LABEL[value] ?? value;
}

export function categoryValue(input: string): string {
  if (CATEGORY_LABELS[input]) return input;
  return CATEGORY_VALUE_FROM_LABEL[input] ?? input;
}

export function statusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

export function typeLabel(value: string): string {
  return TYPE_LABELS[value] ?? value;
}

export function matchLabelVi(value: string): string {
  return MATCH_LABELS[value] ?? value;
}

export function matchReasonVi(value: string): string {
  return MATCH_REASON_LABELS[value] ?? value;
}
