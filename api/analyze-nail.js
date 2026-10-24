
/*
 * 香香村 AI Nail Analysis V2
 * 測試分支專用
 * Gemini 自動重試 + 錯誤診斷
 * 保留 Firebase 店主驗證及 Cloudinary 限制
 */

const OWNER_UID =
  "T9nwxBSXqKYWVsS6dmEN62tpt232";

const MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash";

const CLOUD_NAME = "mby1sz4i";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const MAX_ATTEMPTS = 3;

const RETRYABLE_STATUS = new Set([
  408, 429, 500, 502, 503, 504
]);

function reply(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  return res.status(status).json(body);
}

function wait(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function parseImageUrl(value) {
  if (
    typeof value !== "string" ||
    value.length > 2048
  ) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      url.hostname !== "res.cloudinary.com" ||
      url.port ||
      url.username ||
      url.password
    ) {
      return null;
    }

    if (
      !url.pathname.startsWith(
        `/${CLOUD_NAME}/image/upload/`
      )
    ) {
      return null;
    }

    if (
      !url.pathname.includes(
        "/xiang-beauty-artworks/"
      )
    ) {
      return null;
    }

    if (url.search || url.hash) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

async function verifyOwner(req) {
  const match = String(
    req.headers.authorization || ""
  ).match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return false;
  }

  const key =
    process.env.FIREBASE_WEB_API_KEY;

  if (!key) {
    throw new Error(
      "FIREBASE_WEB_API_KEY 尚未設定"
    );
  }

  const response = await fetch(
    "https://identitytoolkit.googleapis.com/v1/" +
    "accounts:lookup?key=" +
    encodeURIComponent(key),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        idToken: match[1]
      }),
      signal: AbortSignal.timeout(10000)
    }
  );

  if (!response.ok) {
    return false;
  }

  const data = await response.json();

  const user = data.users?.[0];

  return Boolean(
    user &&
    user.localId === OWNER_UID &&
    user.disabled !== true
  );
}

const INSTRUCTION = `
你是香香村美妍製造所的美甲照片辨識助手。

只能辨識照片中確實看得見的指甲。
不可猜測未拍到的手指、材料、價格或工時。
一律使用繁體中文。

請辨識：
1. 手部或足部
2. 可見指甲數量
3. 基礎底款
4. 造型元素
5. 各元素可見施工數量
6. 無法確認的問題

基礎底款只能使用：
solid：單色
cat：貓眼
mirror：鏡面
french：法式
partial：局部造型
unknown：無法確認

造型代碼只能使用：
jump：跳色
matte：霧面
blend：暈染
line：線條
geometry：幾何
graphic：圖騰
fire：火焰
cross：十字
cat1：單指貓眼
mirror1：單指鏡面
liquid：液態金屬
letters：文字
sticker：貼紙
logo：LOGO
custom：客製手繪
gem：鑽飾
stud：金屬飾品
sculpt：立體造型
extend：延長
french1：單指法式
decor：裝飾

重要：
- count 表示照片可見的施工指數。
- gem 可以使用可見顆數。
- 不要猜測不可見的手指。
- 貓眼底款可以同時辨識貓眼效果，
  但不得自行推算加購價格。
- 主題手繪請辨識 custom。
- 複雜 LOGO 請辨識 logo。
- 不確定的項目請降低 confidence。
- 不要提供任何價格。
`;

const ITEM_IDS = [
  "jump",
  "matte",
  "blend",
  "line",
  "geometry",
  "graphic",
  "fire",
  "cross",
  "cat1",
  "mirror1",
  "liquid",
  "letters",
  "sticker",
  "logo",
  "custom",
  "gem",
  "stud",
  "sculpt",
  "extend",
  "french1",
  "decor"
];

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    zone: {
      type: "STRING",
      enum: [
        "hand",
        "foot",
        "unknown"
      ]
    },
    visibleNails: {
      type: "INTEGER"
    },
    base: {
      type: "STRING",
      enum: [
        "solid",
        "cat",
        "mirror",
        "french",
        "partial",
        "unknown"
      ]
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: {
            type: "STRING",
            enum: ITEM_IDS
          },
          count: {
            type: "INTEGER"
          },
          confidence: {
            type: "STRING",
            enum: [
              "high",
              "medium",
              "low"
            ]
          },
          reason: {
            type: "STRING"
          }
        },
        required: [
          "id",
          "count",
          "confidence",
          "reason"
        ]
      }
    },
    summary: {
      type: "STRING"
    },
    questions: {
      type: "ARRAY",
      items: {
        type: "STRING"
      }
    }
  },
  required: [
    "zone",
    "visibleNails",
    "base",
    "items",
    "summary",
    "questions"
  ]
};

function errorMessage(status) {
  if (status === 400) {
    return "Gemini 請求格式有問題，請檢查模型與結構化輸出設定。";
  }

  if (status === 401 || status === 403) {
    return "Gemini API 金鑰或專案權限異常，請檢查 Vercel 環境變數。";
  }

  if (status === 404) {
    return (
      `Gemini 模型 ${MODEL} 無法使用（404）。` +
      "請確認模型名稱及 API 版本。"
    );
  }

  if (status === 429) {
    return "Gemini 請求次數或額度達到限制（429），請稍後再試。";
  }

  if (status === 503) {
    return "Gemini 服務忙碌（503），已嘗試自動重試。";
  }

  if (status >= 500) {
    return (
      `Gemini 伺服器錯誤（${status}），` +
      "已嘗試自動重試。"
    );
  }

  return `Gemini 分析失敗（HTTP ${status}）。`;
}

function normalizeResult(result) {
  const validIds = new Set(ITEM_IDS);

  const items = Array.isArray(result.items)
    ? result.items
        .filter(x =>
          x &&
          validIds.has(x.id) &&
          Number.isInteger(x.count) &&
          x.count >= 1 &&
          x.count <= 50
        )
        .slice(0, 25)
        .map(x => ({
          id: x.id,
          count: x.count,
          confidence: [
            "high",
            "medium",
            "low"
          ].includes(x.confidence)
            ? x.confidence
            : "low",
          reason: String(
            x.reason || ""
          ).slice(0, 150)
        }))
    : [];

  return {
    zone: [
      "hand",
      "foot",
      "unknown"
    ].includes(result.zone)
      ? result.zone
      : "unknown",

    visibleNails: Number.isInteger(
      result.visibleNails
    )
      ? Math.max(
          0,
          Math.min(
            10,
            result.visibleNails
          )
        )
      : 0,

    base: [
      "solid",
      "cat",
      "mirror",
      "french",
      "partial",
      "unknown"
    ].includes(result.base)
      ? result.base
      : "unknown",

    items,

    summary: String(
      result.summary || ""
    ).slice(0, 500),

    questions: Array.isArray(
      result.questions
    )
      ? result.questions
          .slice(0, 5)
          .map(x =>
            String(x).slice(0, 200)
          )
      : [],

    pricingStatus: "not_priced",
    requiresOwnerReview: true
  };
}

async function requestGemini({
  apiKey,
  mimeType,
  buffer
}) {
  const endpoint =
    "https://generativelanguage.googleapis.com/" +
    `v1beta/models/${MODEL}:generateContent`;

  const body = JSON.stringify({
    systemInstruction: {
      parts: [
        {
          text: INSTRUCTION
        }
      ]
    },

    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "分析這張美甲作品照片，" +
              "輸出結構化辨識結果。"
          },
          {
            inlineData: {
              mimeType,
              data: buffer.toString("base64")
            }
          }
        ]
      }
    ],

    generationConfig: {
      responseMimeType:
        "application/json",
      responseSchema:
        RESPONSE_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 4096
    }
  });

  let lastStatus = null;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt++
  ) {
    try {
      const response = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "x-goog-api-key":
              apiKey
          },
          body,
          signal:
            AbortSignal.timeout(20000)
        }
      );

      if (response.ok) {
        const payload =
          await response.json();

        const raw =
          payload.candidates?.[0]
            ?.content?.parts
            ?.map(p => p.text || "")
            .join("");

        if (!raw) {
          return {
            ok: false,
            status: 502,
            error:
              "Gemini 未回傳可用的辨識內容。",
            attempts: attempt
          };
        }

        let parsed;

        try {
          parsed = JSON.parse(raw);
        } catch {
          return {
            ok: false,
            status: 502,
            error:
              "Gemini 回傳格式不完整，請重新分析。",
            attempts: attempt
          };
        }

        return {
          ok: true,
          data: normalizeResult(parsed),
          attempts: attempt
        };
      }

      lastStatus = response.status;

      console.error(
        "Gemini request failed",
        {
          status: lastStatus,
          attempt,
          model: MODEL
        }
      );

      if (
        !RETRYABLE_STATUS.has(
          lastStatus
        ) ||
        attempt === MAX_ATTEMPTS
      ) {
        return {
          ok: false,
          status: lastStatus,
          error:
            errorMessage(lastStatus),
          attempts: attempt
        };
      }

      // 避免長時間等待或頻繁重送
      const delay =
        attempt === 1 ? 700 : 1500;

      await wait(delay);

    } catch (error) {
      console.error(
        "Gemini network error",
        {
          attempt,
          name: error?.name,
          message: error?.message
        }
      );

      if (attempt === MAX_ATTEMPTS) {
        return {
          ok: false,
          status: 504,
          error:
            "Gemini 連線逾時或網路異常，" +
            "已完成自動重試。",
          attempts: attempt
        };
      }

      await wait(
        attempt === 1 ? 700 : 1500
      );
    }
  }

  return {
    ok: false,
    status: lastStatus || 502,
    error: "Gemini 分析失敗。",
    attempts: MAX_ATTEMPTS
  };
}

export default async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return reply(res, 405, {
      error: "僅接受 POST 請求"
    });
  }

  try {
    const owner =
      await verifyOwner(req);

    if (!owner) {
      return reply(res, 403, {
        error:
          "請使用村長帳號登入。"
      });
    }

    const imageUrl =
      parseImageUrl(
        req.body?.imageUrl
      );

    if (!imageUrl) {
      return reply(res, 400, {
        error:
          "只接受香香村 Cloudinary 作品照片網址。"
      });
    }

    const apiKey =
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return reply(res, 503, {
        error:
          "GEMINI_API_KEY 尚未設定。"
      });
    }

    const imageResponse =
      await fetch(
        imageUrl,
        {
          redirect: "error",
          signal:
            AbortSignal.timeout(12000)
        }
      );

    if (!imageResponse.ok) {
      return reply(res, 400, {
        error:
          "無法讀取作品照片。"
      });
    }

    const mimeType = (
      imageResponse.headers.get(
        "content-type"
      ) || ""
    ).split(";")[0].toLowerCase();

    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp"
      ].includes(mimeType)
    ) {
      return reply(res, 415, {
        error:
          "只支援 JPG、PNG、WebP。"
      });
    }

    const length = Number(
      imageResponse.headers.get(
        "content-length"
      ) || 0
    );

    if (
      length > MAX_IMAGE_BYTES
    ) {
      return reply(res, 413, {
        error:
          "圖片不得超過 8MB。"
      });
    }

    const buffer = Buffer.from(
      await imageResponse.arrayBuffer()
    );

    if (
      buffer.length >
      MAX_IMAGE_BYTES
    ) {
      return reply(res, 413, {
        error:
          "圖片不得超過 8MB。"
      });
    }

    const result =
      await requestGemini({
        apiKey,
        mimeType,
        buffer
      });

    if (!result.ok) {
      return reply(
        res,
        result.status === 429
          ? 429
          : 502,
        {
          error: result.error,
          geminiStatus:
            result.status,
          attempts:
            result.attempts
        }
      );
    }

    return reply(res, 200, {
      ...result.data,
      attempts: result.attempts,
      model: MODEL
    });

  } catch (error) {
    console.error(
      "Nail analysis error:",
      error?.message || error
    );

    return reply(res, 500, {
      error:
        "圖片分析發生系統錯誤，" +
        "請稍後再試。"
    });
  }
}
