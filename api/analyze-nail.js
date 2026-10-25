
/*
 * 香香村 AI 美甲辨識 V2.2
 * OpenRouter 優先、Gemini 備援
 * 安全診斷：GET /api/analyze-nail
 * 僅供測試分支使用
 */

const OWNER_UID = "T9nwxBSXqKYWVsS6dmEN62tpt232";
const CLOUD_NAME = "mby1sz4i";
const MAX_BYTES = 4 * 1024 * 1024;

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

const IDS = [
  "jump","matte","blend","line","geometry",
  "graphic","fire","cross","cat1","mirror1",
  "liquid","letters","sticker","logo","custom",
  "gem","stud","sculpt","extend","french1","decor"
];

function send(res,status,data){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  return res.status(status).json(data);
}

async function verifyOwner(req){
  const token = String(
    req.headers.authorization || ""
  ).match(/^Bearer\s+(\S+)$/i)?.[1];

  if(!token)return false;

  const key = process.env.FIREBASE_WEB_API_KEY;
  if(!key)throw Error("Firebase 驗證設定缺失");

  const response = await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="
    + encodeURIComponent(key),
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({idToken:token}),
      signal:AbortSignal.timeout(10000)
    }
  );

  if(!response.ok)return false;

  const data = await response.json();
  const user = data.users?.[0];

  return Boolean(
    user &&
    user.localId === OWNER_UID &&
    user.disabled !== true
  );
}

function diagnosis(){
  return {
    version:"2.2",
    openRouter:{
      configured:Boolean(process.env.OPENROUTER_API_KEY),
      model:OPENROUTER_MODEL
    },
    gemini:{
      configured:Boolean(process.env.GEMINI_API_KEY),
      model:GEMINI_MODEL
    },
    firebase:{
      configured:Boolean(process.env.FIREBASE_WEB_API_KEY)
    },
    environment:process.env.VERCEL_ENV || "unknown",
    branch:process.env.VERCEL_GIT_COMMIT_REF || "unknown"
  };
}

function validImageUrl(value){
  try{
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
  }catch{
    return false;
  }
}

async function getImage(body){
  if(typeof body?.imageData === "string"){
    const match = body.imageData.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
    );

    if(!match)throw Error("圖片格式不正確");

    if(match[2].length > MAX_BYTES * 1.4){
      throw Error("圖片太大");
    }

    const buffer = Buffer.from(match[2],"base64");

    if(!buffer.length || buffer.length > MAX_BYTES){
      throw Error("圖片不可超過 4MB");
    }

    return {buffer,mimeType:match[1]};
  }

  if(!validImageUrl(body?.imageUrl)){
    throw Error("請提供有效圖片");
  }

  const response = await fetch(body.imageUrl,{
    redirect:"error",
    signal:AbortSignal.timeout(12000)
  });

  if(!response.ok)throw Error("無法讀取圖片");

  const length = Number(
    response.headers.get("content-length") || 0
  );

  if(length > MAX_BYTES)throw Error("圖片太大");

  const mimeType = String(
    response.headers.get("content-type") || ""
  ).split(";")[0].toLowerCase();

  if(!["image/jpeg","image/png","image/webp"]
    .includes(mimeType)){
    throw Error("不支援此圖片格式");
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  if(buffer.length > MAX_BYTES){
    throw Error("圖片不可超過 4MB");
  }

  return {buffer,mimeType};
}

const PROMPT = `
你是香香村美妍製造所的專業美甲分析師。

請使用繁體中文，只回傳 JSON。

【辨識規則】
1. 判斷照片是否為美甲作品。
2. 只辨識實際可見的指甲，不得虛構另一手。
3. 逐指分析顏色、甲型、技術與裝飾。
4. 區分基礎凝膠與額外施工。
5. 不要計算價格。
6. 不確定的內容列入 questions。

【底款】
base 只能是：
solid、cat、mirror、french、partial、unknown

zone 只能是：
hand、foot、unknown

【施工項目 ID】
${IDS.join(",")}

例如五指中三指單色、兩指暈染：
base=solid
items=[{"id":"blend","count":2}]

跳色 jump 只能計一次，count=1。
整手貓眼不可重複計 cat1。
整手鏡面不可重複計 mirror1。

【風格命名】
styleName 必須是符合照片的小紅書風格名稱。
例如：
清冷高級感、韓系千金、奶呼呼、
美拉德、溫柔御姐、暗黑星河、甜酷辣妹。

styleTags 請產生 2 至 5 個。
colors 請產生 1 至 5 個。

【輸出格式】
{
  "isNailImage":true,
  "zone":"hand",
  "base":"solid",
  "visibleNails":5,
  "summary":"照片款式說明",
  "styleName":"清冷高級感",
  "styleTags":["韓系","簡約"],
  "colors":["銀白","透粉"],
  "items":[
    {
      "id":"blend",
      "count":2,
      "confidence":"high",
      "reason":"兩指可見漸層"
    }
  ],
  "questions":[],
  "nails":[
    {
      "position":"食指",
      "description":"粉色透感底",
      "effects":["solid"]
    }
  ]
}
`;

function cleanResult(raw){
  if(!raw || typeof raw !== "object" ||
     typeof raw.isNailImage !== "boolean"){
    throw Error("AI JSON 缺少必要欄位");
  }

  const str = (v,n=160)=>
    String(v ?? "").slice(0,n);

  const allowed = new Set(IDS);
  const merged = new Map();

  if(Array.isArray(raw.items)){
    for(const item of raw.items){
      if(!item || !allowed.has(item.id))continue;

      const count = Number(item.count);
      if(!Number.isInteger(count) ||
         count < 1 || count > 50)continue;

      const old = merged.get(item.id);

      merged.set(item.id,{
        id:item.id,
        count:item.id === "jump"
          ?1
          :Math.min(50,(old?.count || 0)+count),
        confidence:["high","medium","low"]
          .includes(item.confidence)
          ?item.confidence:"low",
        reason:str(item.reason)
      });
    }
  }

  return {
    isNailImage:raw.isNailImage,
    zone:["hand","foot","unknown"]
      .includes(raw.zone)?raw.zone:"unknown",
    base:["solid","cat","mirror","french",
      "partial","unknown"]
      .includes(raw.base)?raw.base:"unknown",
    visibleNails:Number.isInteger(raw.visibleNails)
      ?Math.max(0,Math.min(10,raw.visibleNails))
      :0,
    summary:str(raw.summary,500),
    styleName:str(raw.styleName,40),
    styleTags:Array.isArray(raw.styleTags)
      ?raw.styleTags.slice(0,5).map(x=>str(x,30))
      :[],
    colors:Array.isArray(raw.colors)
      ?raw.colors.slice(0,5).map(x=>str(x,30))
      :[],
    items:[...merged.values()],
    questions:Array.isArray(raw.questions)
      ?raw.questions.slice(0,5).map(x=>str(x,180))
      :[],
    nails:Array.isArray(raw.nails)
      ?raw.nails.slice(0,10).map(x=>({
        position:str(x.position,20),
        description:str(x.description,120),
        effects:Array.isArray(x.effects)
          ?x.effects.slice(0,8).map(v=>str(v,25))
          :[]
      }))
      :[],
    pricingStatus:"not_priced",
    requiresOwnerReview:true
  };
}

function parseAnalysis(text){
  if(typeof text !== "string" || !text.trim()){
    throw Error("AI 回傳空白內容");
  }

  const cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i,"")
    .replace(/\s*```$/,"");

  try{
    return cleanResult(JSON.parse(cleaned));
  }catch(firstError){
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");

    if(a < 0 || b <= a){
      throw Error("AI 未回傳有效 JSON");
    }

    try{
      return cleanResult(
        JSON.parse(cleaned.slice(a,b+1))
      );
    }catch{
      throw Error("AI JSON 格式無法解析");
    }
  }
}

async function callOpenRouter(image,key){
  const dataUrl =
    "data:" + image.mimeType + ";base64,"
    + image.buffer.toString("base64");

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method:"POST",
      headers:{
        Authorization:"Bearer "+key,
        "Content-Type":"application/json",
        "X-Title":"Xiang Beauty Nail AI"
      },
      body:JSON.stringify({
        model:OPENROUTER_MODEL,
        messages:[
          {role:"system",content:PROMPT},
          {
            role:"user",
            content:[
              {
                type:"text",
                text:"請分析照片並輸出 JSON。"
              },
              {
                type:"image_url",
                image_url:{url:dataUrl}
              }
            ]
          }
        ],
        temperature:0.15,
        max_tokens:3000
      }),
      signal:AbortSignal.timeout(25000)
    }
  );

  if(!response.ok){
    const body = await response.text();

    console.error(
      "OpenRouter HTTP",
      response.status,
      body.slice(0,500)
    );

    throw Error(
      "OpenRouter HTTP "+response.status
    );
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;

  const text = typeof content === "string"
    ?content
    :Array.isArray(content)
      ?content.map(x=>x.text || "").join("")
      :"";

  return {
    data:parseAnalysis(text),
    provider:"OpenRouter",
    model:payload.model || OPENROUTER_MODEL
  };
}

async function callGemini(image,key){
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/"
    + encodeURIComponent(GEMINI_MODEL)
    + ":generateContent";

  const response = await fetch(endpoint,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-goog-api-key":key
    },
    body:JSON.stringify({
      systemInstruction:{
        parts:[{text:PROMPT}]
      },
      contents:[{
        role:"user",
        parts:[
          {text:"請分析美甲照片，僅輸出 JSON。"},
          {
            inlineData:{
              mimeType:image.mimeType,
              data:image.buffer.toString("base64")
            }
          }
        ]
      }],
      generationConfig:{
        responseMimeType:"application/json",
        temperature:0.15,
        maxOutputTokens:3000
      }
    }),
    signal:AbortSignal.timeout(25000)
  });

  if(!response.ok){
    const body = await response.text();

    console.error(
      "Gemini HTTP",
      response.status,
      body.slice(0,500)
    );

    throw Error(
      "Gemini HTTP "+response.status
    );
  }

  const payload = await response.json();

  const text = payload.candidates?.[0]?.content?.parts
    ?.map(x=>x.text || "").join("") || "";

  return {
    data:parseAnalysis(text),
    provider:"Gemini",
    model:GEMINI_MODEL
  };
}

async function analyzeWithFallback(image){
  const errors=[];

  const openRouterKey=process.env.OPENROUTER_API_KEY;
  const geminiKey=process.env.GEMINI_API_KEY;

  if(openRouterKey){
    try{
      return await callOpenRouter(image,openRouterKey);
    }catch(error){
      errors.push(error.message);
      console.error("OpenRouter failed:",error.message);
    }
  }else{
    errors.push("OPENROUTER_API_KEY missing");
  }

  if(geminiKey){
    try{
      return await callGemini(image,geminiKey);
    }catch(error){
      errors.push(error.message);
      console.error("Gemini failed:",error.message);
    }
  }else{
    errors.push("GEMINI_API_KEY missing");
  }

  return {failed:true,errors};
}

export default async function handler(req,res){
  if(!["GET","POST"].includes(req.method)){
    res.setHeader("Allow","GET, POST");
    return send(res,405,{error:"Method not allowed"});
  }

  try{
    const authorized=await verifyOwner(req);

    if(!authorized){
      return send(res,403,{
        error:"請先使用村長帳號登入"
      });
    }

    // GET 診斷不呼叫 AI，也不消耗 AI 額度
    if(req.method==="GET"){
      return send(res,200,{
        ok:true,
        diagnostic:diagnosis()
      });
    }

    let image;

    try{
      image=await getImage(req.body);
    }catch(error){
      return send(res,400,{
        error:error.message
      });
    }

    const result=await analyzeWithFallback(image);

    if(result.failed){
      console.error(
        "AI V2.2 diagnosis:",
        JSON.stringify(diagnosis())
      );

      console.error(
        "AI providers failed:",
        result.errors.join("; ")
      );

      return send(res,503,{
        error:"AI 服務未完成辨識",
        details:result.errors,
        diagnostic:diagnosis()
      });
    }

    return send(res,200,{
      ...result.data,
      provider:result.provider,
      model:result.model
    });

  }catch(error){
    console.error("AI system error:",error.message);

    return send(res,500,{
      error:"AI 系統發生錯誤"
    });
  }
}
