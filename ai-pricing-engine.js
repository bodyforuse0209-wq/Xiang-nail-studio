
/*
 * 香香村 AI 智能報價引擎 V1
 * 僅供 feature/ai-nail-consultation 測試
 * 不修改正式 V10 系統
 */

export const BASE_PRICES = {
  men: {
    hand: {
      solid: 800,
      cat: 1000,
      mirror: 1200,
      french: 1300
    },
    foot: {
      solid: 900,
      cat: 1100,
      mirror: 1300,
      french: 1400
    }
  },
  women: {
    hand: {
      solid: 800,
      cat: 1000,
      mirror: 1100,
      french: 1300
    },
    foot: {
      solid: 900,
      cat: 1100,
      mirror: 1200,
      french: 1400
    }
  }
};

export const ADDON_PRICES = {
  men: {
    jump: 50,
    matte: 50,
    blend: 80,
    line: 80,
    geometry: 100,
    graphic: 120,
    fire: 120,
    cross: 100,
    cat1: 50,
    mirror1: 70,
    liquid: 150,
    letters: 100,
    sticker: 80,
    logo: 250,
    custom: 350,
    gem: 10,
    stud: 50,
    sculpt: 200
  },
  women: {
    jump: 50,
    blend: 80,
    extend: 100,
    french1: 80,
    mirror1: 70,
    cat1: 50,
    gem: 10,
    decor: 50
  }
};

export const STYLE_PREMIUM = {
  clean: 0,
  graphic: 0,
  metal: 100,
  fandom: 200
};

const CUSTOM_IDS = new Set([
  "custom",
  "sculpt",
  "logo"
]);

const REVIEW_IDS = new Set([
  "graphic",
  "letters",
  "sticker",
  "liquid",
  "decor",
  "gem",
  "stud",
  "jump"
]);

export function normalizeAnalysis(raw = {}) {
  const items = Array.isArray(raw.items)
    ? raw.items
    : [];

  return {
    zone: ["hand", "foot"].includes(raw.zone)
      ? raw.zone
      : "unknown",

    base: [
      "solid",
      "cat",
      "mirror",
      "french",
      "partial"
    ].includes(raw.base)
      ? raw.base
      : "unknown",

    visibleNails: Math.max(
      0,
      Math.min(10, Number(raw.visibleNails) || 0)
    ),

    items: items
      .filter(x => x && typeof x.id === "string")
      .map(x => ({
        id: x.id,
        count: Math.max(
          0,
          Math.min(
            50,
            Math.floor(Number(x.count) || 0)
          )
        ),
        confidence: x.confidence || "low",
        reason: String(x.reason || "")
      }))
      .filter(x => x.count > 0),

    questions: Array.isArray(raw.questions)
      ? raw.questions
      : [],

    summary: String(raw.summary || "")
  };
}

export function classifyArtwork(raw) {
  const a = normalizeAnalysis(raw);

  const complex = a.items.some(x =>
    (x.id === "custom" && x.count >= 3) ||
    x.id === "sculpt" ||
    x.id === "logo" ||
    (x.id === "graphic" && x.count >= 5)
  );

  if (complex) {
    return {
      status: "custom_quote",
      label: "客製報價",
      amount: null,
      reason:
        "多指主題手繪、LOGO 或複雜立體造型，" +
        "需由村長評估工時、材料及施工難度。"
    };
  }

  const needsReview =
    a.zone === "unknown" ||
    a.base === "unknown" ||
    a.base === "partial" ||
    a.visibleNails === 0 ||
    a.questions.length > 0 ||
    a.items.some(x =>
      x.confidence !== "high" ||
      REVIEW_IDS.has(x.id) ||
      CUSTOM_IDS.has(x.id)
    );

  if (needsReview) {
    return {
      status: "owner_review",
      label: "待村長確認",
      amount: null,
      reason:
        "部分造型、數量或施工方式需要人工確認。"
    };
  }

  return {
    status: "standard",
    label: "可套用標準價目",
    amount: null,
    reason:
      "辨識項目可標準化，" +
      "但仍須確認完整服務及實際價格。"
  };
}

export function calculateQuote(
  raw,
  {
    gender = "men",
    style = "clean",
    ownerApproved = false,
    prices = null
  } = {}
) {
  const a = normalizeAnalysis(raw);
  const tier = classifyArtwork(a);

  if (tier.status === "custom_quote") {
    return {
      ...tier,
      lines: [],
      total: null
    };
  }

  if (!ownerApproved || tier.status !== "standard") {
    return {
      ...tier,
      lines: [],
      total: null
    };
  }

  const defaultBase =
    BASE_PRICES[gender]?.[a.zone]?.[a.base];

  if (defaultBase === undefined) {
    return {
      status: "owner_review",
      label: "待村長確認",
      reason: "底款或施作部位尚未確認。",
      lines: [],
      total: null
    };
  }

  if (prices === null) {
    return {
      status: "owner_review",
      label: "待確認 V10 價目",
      reason:
        "尚未取得 V10 即時價目設定，" +
        "為避免價格不一致，暫不計價。",
      lines: [],
      total: null
    };
  }

  function price(category, id, fallback) {
    const key =
      `${gender}:${a.zone}:${category}:${id}`;

    const override = prices[key];

    return override !== undefined &&
      override !== null &&
      override !== "" &&
      Number.isFinite(Number(override))
      ? Math.max(0, Number(override))
      : fallback;
  }

  const lines = [];

  lines.push({
    name: "基礎凝膠",
    amount: price("base", a.base, defaultBase)
  });

  if (gender === "men") {
    const premium = STYLE_PREMIUM[style] || 0;

    if (premium > 0) {
      lines.push({
        name: "男士風格加價",
        amount: premium
      });
    }
  }

  const seen = new Set();

  for (const item of a.items) {
    if (seen.has(item.id)) continue;

    seen.add(item.id);

    // 整手貓眼底價已包含貓眼效果
    if (a.base === "cat" && item.id === "cat1") {
      continue;
    }

    // 整手鏡面底價已包含鏡面效果
    if (
      a.base === "mirror" &&
      item.id === "mirror1"
    ) {
      continue;
    }

    // 跳色不能直接把所有可見指甲當作加購
    if (
      item.id === "jump" ||
      item.id === "custom"
    ) {
      return {
        status: "owner_review",
        label: "待村長確認",
        reason:
          "跳色或手繪數量需要人工確認，" +
          "避免重複計價。",
        lines: [],
        total: null
      };
    }

    const unit = ADDON_PRICES[gender]?.[item.id];

    if (unit === undefined) {
      return {
        status: "owner_review",
        label: "待村長確認",
        reason:
          "此造型尚未建立可使用的標準單價：" +
          item.id,
        lines: [],
        total: null
      };
    }

    lines.push({
      name: `${item.id} × ${item.count}`,
      amount:
        price("addon", item.id, unit) *
        item.count
    });
  }

  const total = lines.reduce(
    (sum, line) => sum + line.amount,
    0
  );

  return {
    status: "standard",
    label: "村長確認後估價",
    reason:
      "僅計算已確認項目，" +
      "不含卸甲、保養及其他服務。",
    lines,
    total
  };
}

export function calculateCustomQuote({
  laborMinutes = 0,
  hourlyRate = 0,
  materials = 0,
  complexityFee = 0,
  adjustment = 0
} = {}) {
  const values = [
    laborMinutes,
    hourlyRate,
    materials,
    complexityFee,
    adjustment
  ].map(Number);

  if (
    values.some(x => !Number.isFinite(x)) ||
    values.slice(0, 4).some(x => x < 0)
  ) {
    return {
      valid: false,
      total: null,
      error: "請輸入有效工時與金額。"
    };
  }

  const [
    minutes,
    rate,
    material,
    complexity,
    adjust
  ] = values;

  const labor = Math.round(
    minutes * rate / 60
  );

  const total = Math.max(
    0,
    Math.round(
      labor + material + complexity + adjust
    )
  );

  return {
    valid: true,
    labor,
    total,
    breakdown: [
      { name: "人工工時", amount: labor },
      { name: "材料費", amount: material },
      { name: "施工難度", amount: complexity },
      { name: "人工調整", amount: adjust }
    ]
  };
}
