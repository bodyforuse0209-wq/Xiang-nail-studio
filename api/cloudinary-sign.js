
import crypto from "node:crypto";

const PROJECT_ID = "xiang-beauty-studio";
const OWNER_UID = "T9nwxBSXqKYWVsS6dmEN62tpt232";
const FOLDER = "xiang-beauty-artworks";

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "僅接受 POST 請求" });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return send(res, 503, { error: "圖片服務尚未設定完成" });
  }

  try {
    const authorization = req.headers.authorization || "";
    const match = authorization.match(/^Bearer (.+)$/i);

    if (!match) {
      return send(res, 401, { error: "請先登入店主帳號" });
    }

    // 向 Firebase 驗證 ID Token，避免信任前端自行提供的 UID。
    const verifyResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY || "AIzaSyC1idUvGJ8QlNsXhqj7dmSAH7pp8hXs1DY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: match[1] })
      }
    );

    if (!verifyResponse.ok) {
      return send(res, 401, { error: "登入憑證無效或已過期" });
    }

    const verified = await verifyResponse.json();
    const user = verified.users?.[0];

    if (
      !user ||
      user.localId !== OWNER_UID ||
      user.disabled === true
    ) {
      return send(res, 403, { error: "只有村長可以上傳作品" });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      folder: FOLDER,
      overwrite: "false",
      timestamp
    };

    const signatureBase = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");

    const signature = crypto
      .createHash("sha1")
      .update(signatureBase + apiSecret)
      .digest("hex");

    return send(res, 200, {
      cloudName,
      apiKey,
      folder: FOLDER,
      overwrite: "false",
      timestamp,
      signature
    });
  } catch (error) {
    console.error("Cloudinary sign error:", error);
    return send(res, 500, { error: "無法取得圖片上傳授權" });
  }
}
