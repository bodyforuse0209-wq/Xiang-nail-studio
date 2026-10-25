
/*
 * XIANG BEAUTY STUDIO
 * AI Nail Analyzer V2.4
 * Vision Model Validation + Diagnostics
 * OpenRouter / Gemini Fallback
 * Owner-only Firebase Authentication
 */

export const maxDuration = 60;

const OWNER_UID = "T9nwxBSXqKYWVsS6dmEN62tpt232";
const CLOUD_NAME = "mby1sz4i";
const MAX_BYTES = 4 * 1024 * 1024;

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

const TIMEOUT_MS = 22000;

const IDS = [
  "jump", "matte", "blend", "line",
  "geometry", "graphic", "fire", "cross",
  "cat1", "mirror1", "liquid", "letters",
  "sticker", "logo", "custom", "gem",
  "stud", "sculpt", "extend", "french1",
  "decor"
];

function send(res, status, data) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(data);
}

function errorText(error) {
  if (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    /timeout|timed out/i.test(error?.message || "")
  ) {
    return "請求逾時（22 秒）";
  }
  return String(error?.message || "未知錯誤").slice(0, 180);
}

async function verifyOwner(req) {
  const token = String(
    req.headers.authorization || ""
  ).match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!token) return false;

  const key = process.env.FIREBASE_WEB_API_KEY;
  if (!key) throw Error("Firebase 設定缺失");

  const response = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
      encodeURIComponent(key),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(10000)
    }
  );

  if (!response.ok) return false;

  const data = await response.json();
  const user = data.users?.[0];

  return Boolean(
    user &&
    user.localId === OWNER_UID &&
    user.disabled !== true
  );
}

function diagnosis() {
  return {
    version: "2.4",
    openRouter: {
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      model: OPENROUTER_MODEL
    },
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: GEMINI_MODEL
    },
    firebase: {
      configured: Boolean(process.env.FIREBASE_WEB_API_KEY)
    },
    environment: process.env.VERCEL_ENV || "unknown",
    branch: process.env.VERCEL_GIT_COMMIT_REF || "unknown",
    timeoutMsPerProvider: TIMEOUT_MS
  };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 350) };
  }
}

async function checkOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;

  if (!key) {
    return {
      reachable: false,
      reason: "API Key 未設定"
    };
  }

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/models",
      {
        headers: {
          Authorization: "Bearer " + key
        },
        signal: AbortSignal.timeout(9000)
      }
    );

    if (!response.ok) {
      return {
        reachable: false,
        httpStatus: response.status
      };
    }

    const json = await response.json();
    const models = Array.isArray(json.data)
      ? json.data
      : [];

    const selected = models.find(
      m => m.id === OPENROUTER_MODEL
    );

    const isRouterAlias =
      OPENROUTER_MODEL === "openrouter/free";

    const visionModels = models.filter(m =>
      Array.isArray(m.architecture?.input_modalities) &&
      m.architecture.input_modalities.includes("image") &&
      Array.isArray(m.architecture?.output_modalities) &&
      m.architecture.output_modalities.includes("text")
    );

    const freeVisionModels = visionModels
      .filter(m => m.id?.endsWith(":free"))
      .slice(0, 8)
      .map(m => m.id);

    const supportsImage = selected
      ? selected.architecture?.input_modalities
          ?.includes("image") === true
      : null;

    return {
      reachable: true,
      httpStatus: 200,
      model: OPENROUTER_MODEL,
      modelFound: Boolean(selected),
      isRouterAlias,
      supportsImage,
      supportsTextOutput: selected
        ? selected.architecture?.output_modalities
            ?.includes("text") === true
        : null,
      freeVisionModels,
      note: isRouterAlias
        ? "這是路由別名，不能保證每次都分配到相同模型"
        : !selected
          ? "設定的模型未出現在模型清單中"
          : !supportsImage
            ? "目前模型未宣告支援圖片輸入"
            : "模型宣告支援圖片，但仍需實際請求驗證"
    };
  } catch (error) {
    return {
      reachable: false,
      reason: errorText(error)
    };
  }
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return {
      reachable: false,
      reason: "API Key 未設定"
    };
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(GEMINI_MODEL),
      {
        headers: {
          "x-goog-api-key": key
        },
        signal: AbortSignal.timeout(9000)
      }
    );

    const json = await readJson(response);

    if (!response.ok) {
      return {
        reachable: false,
        httpStatus: response.status,
        modelFound: response.status === 404 ? false : null,
        reason: String(
          json.error?.message ||
          "無法取得模型資訊"
        ).slice(0, 220)
      };
    }

    const methods = json.supportedGenerationMethods || [];

    return {
      reachable: true,
      httpStatus: 200,
      model: GEMINI_MODEL,
      modelFound: true,
      supportsGenerateContent:
        methods.includes("generateContent"),
      supportedGenerationMethods: methods,
      note: methods.includes("generateContent")
        ? "支援 generateContent；圖片輸入仍需實際測試"
        : "此模型未宣告支援 generateContent"
    };
  } catch (error) {
    return {
      reachable: false,
      reason: errorText(error)
    };
  }
}

async function checkProviders() {
  const [openRouter, gemini] = await Promise.all([
    checkOpenRouter(),
    checkGemini()
  ]);

  return { openRouter, gemini };
}

function validImageUrl(value) {
  try {
    const u = new URL(value);

    return (
      u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      !u.port &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname.startsWith(
        "/" + CLOUD_NAME + "/image/upload/"
      ) &&
      u.pathname.includes("/xiang-beauty-artworks/")
    );
  } catch {
    return false;
  }
}

async function getImage(body) {
  if (typeof body?.imageData === "string") {
    const match = body.imageData.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
    );

    if (!match) throw Error("圖片格式不正確");

    if (match[2].length > MAX_BYTES * 1.4) {
      throw Error("圖片太大");
    }

    const buffer = Buffer.from(match[2], "base64");

    if (!buffer.length || buffer.length > MAX_BYTES) {
      throw Error("圖片不可超過 4MB");
    }

    return {
      buffer,
      mimeType: match[1]
    };
  }

  if (!validImageUrl(body?.imageUrl)) {
    throw Error("請提供有效圖片");
  }

  const response = await fetch(body.imageUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) throw Error("無法讀取圖片");

  const length = Number(
    response.headers.get("content-length") || 0
  );

  if (length > MAX_BYTES) throw Error("圖片太大");

  const mimeType = String(
    response.headers.get("content-type") || ""
  ).split(";")[0].toLowerCase();

  if (!["image/jpeg", "image/png", "image/webp"]
    .includes(mimeType)) {
    throw Error("不支援此圖片格式");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_BYTES) {
    throw Error("圖片不可超過 4MB");
  }

  return { buffer, mimeType };
}

const PROMPT = `
你是香香村美妍製造所的專業美甲分析師。

請使用繁體中文，只輸出有效 JSON，不要 Markdown。

任務：
1. 判斷圖片是否為美甲作品。
2. 只分析實際看得見的指甲。
3. 不得虛構照片中看不到的另一隻手。
4. 逐指分析顏色、質地、造型、裝飾。
5. 區分底款與額外施工。
6. 不要計算價格。
7. 不確定的項目放入 questions。

zone 只能是 hand、foot、unknown。
base 只能是 solid、cat、mirror、french、partial、unknown。

額外施工 ID：
${IDS.join(", ")}

jump 為跳色，一套只計一次，count 必須為 1。
整手貓眼不要重複加 cat1。
整手鏡面不要重複加 mirror1。

styleName 請使用適合照片的美甲風格名稱。
styleTags 提供 2 至 5 個。
colors 提供 1 至 5 個。

JSON 格式：
{
  "isNailImage": true,
  "zone": "hand",
  "base": "solid",
  "visibleNails": 5,
  "summary": "照片款式客觀描述",
  "styleName": "清冷高級感",
  "styleTags": ["韓系", "簡約"],
  "colors": ["銀白", "透粉"],
  "items": [
    {
      "id": "blend",
      "count": 2,
      "confidence": "high",
      "reason": "兩指可見暈染"
    }
  ],
  "questions": [],
  "nails": [
    {
      "position": "食指",
      "description": "粉色透感底",
      "effects": ["solid"]
    }
  ]
}

如果不是美甲圖片，isNailImage 設為 false，
不要猜測美甲內容。
`;

function cleanResult(raw) {
  if (
    !raw ||
    typeof raw !== "object" ||
    typeof raw.isNailImage !== "boolean"
  ) {
    throw Error("AI JSON 缺少必要欄位");
  }

  const str = (v, n = 160) =>
    String(v ?? "").slice(0, n);

  const allowed = new Set(IDS);
  const merged = new Map();

  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (!item || !allowed.has(item.id)) continue;

      const count = Number(item.count);

      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > 50
      ) continue;

      const old = merged.get(item.id);

      merged.set(item.id, {
        id: item.id,
        count: item.id === "jump"
          ? 1
          : Math.min(50, (old?.count || 0) + count),
        confidence:
          ["high", "medium", "low"].includes(item.confidence)
            ? item.confidence
            : "low",
        reason: str(item.reason)
      });
    }
  }

  return {
    isNailImage: raw.isNailImage === true,
    zone: ["hand", "foot", "unknown"].includes(raw.zone)
      ? raw.zone
      : "unknown",
    base: [
      "solid", "cat", "mirror",
      "french", "partial", "unknown"
    ].includes(raw.base)
      ? raw.base
      : "unknown",
    visibleNails: Number.isInteger(raw.visibleNails)
      ? Math.max(0, Math.min(10, raw.visibleNails))
      : 0,
    summary: str(raw.summary, 500),
    styleName: str(raw.styleName, 40),
    styleTags: Array.isArray(raw.styleTags)
      ? raw.styleTags.slice(0, 5).map(x => str(x, 30))
      : [],
    colors: Array.isArray(raw.colors)
      ? raw.colors.slice(0, 5).map(x => str(x, 30))
      : [],
    items: [...merged.values()],
    questions: Array.isArray(raw.questions)
      ? raw.questions.slice(0, 5).map(x => str(x, 180))
      : [],
    nails: Array.isArray(raw.nails)
      ? raw.nails.slice(0, 10).map(x => ({
          position: str(x?.position, 20),
          description: str(x?.description, 120),
          effects: Array.isArray(x?.effects)
            ? x.effects.slice(0, 8).map(v => str(v, 25))
            : []
        }))
      : [],
    pricingStatus: "not_priced",
    requiresOwnerReview: true
  };
}

function parseAnalysis(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw Error("AI 回傳空白內容");
  }

  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return cleanResult(JSON.parse(cleaned));
  } catch {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");

    if (a < 0 || b <= a) {
      throw Error("AI 未回傳有效 JSON");
    }

    try {
      return cleanResult(
        JSON.parse(cleaned.slice(a, b + 1))
      );
    } catch {
      throw Error("AI JSON 格式無法解析");
    }
  }
}

async function callOpenRouter(image, key) {
  const dataUrl =
    "data:" + image.mimeType +
    ";base64," + image.buffer.toString("base64");

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "X-Title": "Xiang Beauty Nail AI"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: PROMPT
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "分析這張美甲照片，只輸出 JSON。"
              },
              {
                type: "image_url",
                image_url: { url: dataUrl }
              }
            ]
          }
        ],
        temperature: 0.15,
        max_tokens: 2500
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    }
  );

  if (!response.ok) {
    const payload = await readJson(response);

    console.error("OpenRouter HTTP error", {
      status: response.status,
      message: String(
        payload.error?.message ||
        payload.raw ||
        "unknown"
      ).slice(0, 350)
    });

    throw Error("OpenRouter HTTP " + response.status);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;

  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map(x => x.text || "").join("")
      : "";

  if (!text.trim()) {
    console.error("OpenRouter empty response", {
      model: payload.model,
      finishReason: payload.choices?.[0]?.finish_reason
    });
  }

  return {
    data: parseAnalysis(text),
    provider: "OpenRouter",
    model: payload.model || OPENROUTER_MODEL
  };
}

async function callGemini(image, key) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(GEMINI_MODEL) +
    ":generateContent";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: PROMPT }]
      },
      contents: [{
        role: "user",
        parts: [
          {
            text: "分析這張美甲照片，只輸出 JSON。"
          },
          {
            inlineData: {
              mimeType: image.mimeType,
              data: image.buffer.toString("base64")
            }
          }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.15,
        maxOutputTokens: 2500
      }
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!response.ok) {
    const payload = await readJson(response);

    console.error("Gemini HTTP error", {
      status: response.status,
      message: String(
        payload.error?.message ||
        payload.raw ||
        "unknown"
      ).slice(0, 350)
    });

    throw Error("Gemini HTTP " + response.status);
  }

  const payload = await response.json();
  const candidate = payload.candidates?.[0];

  const text = candidate?.content?.parts
    ?.map(x => x.text || "")
    .join("") || "";

  if (!text.trim()) {
    console.error("Gemini empty response", {
      finishReason: candidate?.finishReason,
      promptFeedback: payload.promptFeedback
    });
  }

  return {
    data: parseAnalysis(text),
    provider: "Gemini",
    model: GEMINI_MODEL
  };
}

async function analyzeWithFallback(image) {
  const errors = [];

  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await callOpenRouter(
        image,
        process.env.OPENROUTER_API_KEY
      );
    } catch (error) {
      const message = errorText(error);
      errors.push("OpenRouter: " + message);
      console.error("OpenRouter failed:", message);
    }
  } else {
    errors.push("OpenRouter: API Key 未設定");
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return await callGemini(
        image,
        process.env.GEMINI_API_KEY
      );
    } catch (error) {
      const message = errorText(error);
      errors.push("Gemini: " + message);
      console.error("Gemini failed:", message);
    }
  } else {
    errors.push("Gemini: API Key 未設定");
  }

  return { failed: true, errors };
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, {
      error: "Method not allowed"
    });
  }

  try {
    const authorized = await verifyOwner(req);

    if (!authorized) {
      return send(res, 403, {
        error: "請先使用村長帳號登入"
      });
    }

    // GET: 村長專用診斷，不需要上傳照片
    if (req.method === "GET") {
      const connectivity = req.query?.check === "1"
        ? await checkProviders()
        : undefined;

      return send(res, 200, {
        ok: true,
        diagnostic: diagnosis(),
        ...(connectivity ? { connectivity } : {})
      });
    }

    // POST: AI 美甲圖片分析
    let image;

    try {
      image = await getImage(req.body);
    } catch (error) {
      return send(res, 400, {
        error: error.message
      });
    }

    const result = await analyzeWithFallback(image);

    if (result.failed) {
      console.error(
        "AI V2.4 diagnosis:",
        JSON.stringify(diagnosis())
      );

      console.error(
        "AI providers failed:",
        result.errors.join("; ")
      );

      return send(res, 503, {
        error: "AI 服務未完成辨識",
        details: result.errors,
        diagnostic: diagnosis()
      });
    }

    return send(res, 200, {
      ...result.data,
      provider: result.provider,
      model: result.model
    });

  } catch (error) {
    console.error("AI system error:", errorText(error));

    return send(res, 500, {
      error: "AI 系統發生錯誤"
    });
  }
}
