
const CUSTOM_IDS = new Set([
  "custom", "sculpt", "logo"
]);

const REVIEW_IDS = new Set([
  "graphic", "letters", "sticker",
  "liquid", "decor", "gem", "stud"
]);

const STANDARD_IDS = new Set([
  "jump", "matte", "blend", "line",
  "geometry", "fire", "cross",
  "cat1", "mirror1", "extend", "french1"
]);

export function classifyArtwork(analysis) {
  const items = Array.isArray(analysis?.items)
    ? analysis.items : [];

  const questions = Array.isArray(analysis?.questions)
    ? analysis.questions : [];

  const visible = Number.isInteger(analysis?.visibleNails)
    ? analysis.visibleNails : 0;

  const custom = items.filter(x => CUSTOM_IDS.has(x.id));

  const complex =
    custom.some(x => x.id === "custom" && x.count >= 3) ||
    custom.some(x => x.id === "sculpt" || x.id === "logo") ||
    items.some(x => x.id === "graphic" && x.count >= 5);

  if (complex) {
    return {
      status: "custom_quote",
      label: "客製報價",
      amount: null,
      reason: "多指主題手繪或複雜造型，需由村長評估施工難度及工時。"
    };
  }

  const needsReview =
    questions.length > 0 ||
    visible === 0 ||
    analysis?.base === "unknown" ||
    custom.length > 0 ||
    items.some(x =>
      x.confidence !== "high" ||
      REVIEW_IDS.has(x.id) ||
      (!STANDARD_IDS.has(x.id) && !CUSTOM_IDS.has(x.id))
    );

  if (needsReview) {
    return {
      status: "owner_review",
      label: "待村長確認",
      amount: null,
      reason: "部分造型、數量或施工方式需要人工確認。"
    };
  }

  return {
    status: "standard",
    label: "可套用標準價目",
    amount: null,
    reason: "項目可標準化，待串接 V10 價目及服務選擇。"
  };
}
