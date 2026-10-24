
/*
 * XIANG BEAUTY AI ANALYSIS V2
 * 測試分支專用
 * 支援壓縮圖片直接分析、舊版 Cloudinary URL
 * 保留村長驗證
 */

const OWNER_UID = "T9nwxBSXqKYWVsS6dmEN62tpt232";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const CLOUD_NAME = "mby1sz4i";
const MAX_BYTES = 4 * 1024 * 1024;

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
  const token = String(req.headers.authorization||"")
    .match(/^Bearer\s+(\S+)$/i)?.[1];

  if(!token) return false;

  const key = process.env.FIREBASE_WEB_API_KEY;
  if(!key) throw Error("Firebase API Key 未設定");

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

  if(!response.ok) return false;

  const data = await response.json();
  const user = data.users?.[0];

  return Boolean(
    user &&
    user.localId === OWNER_UID &&
    user.disabled !== true
  );
}

function validImageUrl(value){
  try{
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      !u.port && !u.username && !u.password &&
      !u.search && !u.hash &&
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

    if(!match) throw Error("圖片格式不正確");

    if(match[2].length > MAX_BYTES * 1.4){
      throw Error("圖片太大，請重新選擇");
    }

    const buffer = Buffer.from(match[2],"base64");

    if(!buffer.length || buffer.length > MAX_BYTES){
      throw Error("圖片不可超過 4MB");
    }

    return {buffer,mimeType:match[1]};
  }

  if(!validImageUrl(body?.imageUrl)){
    throw Error("請提供有效的美甲圖片");
  }

  const response = await fetch(body.imageUrl,{
    redirect:"error",
    signal:AbortSignal.timeout(12000)
  });

  if(!response.ok) throw Error("無法讀取圖片");

  const length = Number(
    response.headers.get("content-length")||0
  );

  if(length > MAX_BYTES){
    throw Error("圖片不可超過 4MB");
  }

  const mimeType = String(
    response.headers.get("content-type")||""
  ).split(";")[0].toLowerCase();

  if(!["image/jpeg","image/png","image/webp"].includes(mimeType)){
    throw Error("不支援此圖片格式");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if(buffer.length > MAX_BYTES){
    throw Error("圖片不可超過 4MB");
  }

  return {buffer,mimeType};
}

const PROMPT = `
你是台灣專業美甲師，也是香香村美妍製造所的圖片分析助手。
請以繁體中文分析照片。

第一：判斷照片是否真的有美甲作品。
若沒有，isNailImage=false，不可虛構款式。

第二：依照實際可見指甲，逐指判斷施工內容。
不能將背景、服裝、文字或人物誤認為指甲。
不能將沒有拍到的手指當作已辨識。

第三：區分基礎凝膠與加購施工。
例如五指當中三指單色、兩指暈染，
base=solid，items 內 blend 的 count=2。
若同時使用不同單色，可判斷 jump。
但不要因為看見五指顏色不同，
就直接判定跳色有五次收費。
貓眼整手底款不得再重複計單指貓眼。
鏡面整手底款也不得重複計價。

第四：產生美甲風格名稱。
參考小紅書常見的氛圍式命名，
例如奶呼呼、溫柔御姐、韓系千金、
美拉德、清冷高級感、暗黑星河、甜酷辣妹、
靜奢裸感、果凍透感等。
必須根據照片實際呈現的顏色、質地、氛圍命名。
不要把店內計價項目當成風格名稱。
styleName 是主要風格名稱。
styleTags 是 2 至 5 個短標籤。
colors 是 1 至 5 個顏色或質地標籤。

第五：估價所需資料必須嚴謹。
zone 只能 hand、foot、unknown。
base 只能 solid、cat、mirror、french、partial、unknown。
items 的 id 只能使用：
${IDS.join(",")}。
count 是照片中實際可見的施工指數。
gem 可使用顆數。
confidence 只能 high、medium、low。
不要自行推算雙手指數，也不要輸出價格。

請只回傳有效 JSON，結構：
{
 "isNailImage":true,
 "zone":"hand",
 "base":"solid",
 "visibleNails":5,
 "summary":"照片的客觀款式說明",
 "styleName":"美拉德溫柔御姐",
 "styleTags":["秋冬氛圍","韓系姐姐感"],
 "colors":["焦糖棕","鼠尾草綠"],
 "items":[
   {
     "id":"blend",
     "count":2,
     "confidence":"high",
     "reason":"照片可見兩指漸層暈染"
   }
 ],
 "questions":[],
 "nails":[
   {
     "position":"拇指",
     "description":"棕色單色",
     "effects":["solid"]
   }
 ]
}

看不清楚時，降低 confidence 並說明原因。
不得憑空猜測另一隻手。
`;

function cleanResult(raw){
  const allowed = new Set(IDS);
  const str = (v,n=160)=>String(v||"").slice(0,n);

  const items = Array.isArray(raw.items)
    ? raw.items.filter(x=>
        x && allowed.has(x.id) &&
        Number.isInteger(x.count) &&
        x.count>=1 && x.count<=50
      ).slice(0,25).map(x=>({
        id:x.id,
        count:x.count,
        confidence:["high","medium","low"].includes(x.confidence)
          ? x.confidence : "low",
        reason:str(x.reason)
      }))
    : [];

  return {
    isNailImage:raw.isNailImage===true,
    zone:["hand","foot","unknown"].includes(raw.zone)
      ? raw.zone : "unknown",
    base:["solid","cat","mirror","french","partial","unknown"]
      .includes(raw.base) ? raw.base : "unknown",
    visibleNails:Number.isInteger(raw.visibleNails)
      ? Math.max(0,Math.min(10,raw.visibleNails)) : 0,
    summary:str(raw.summary,500),
    styleName:str(raw.styleName,40),
    styleTags:Array.isArray(raw.styleTags)
      ? raw.styleTags.slice(0,5).map(x=>str(x,30)) : [],
    colors:Array.isArray(raw.colors)
      ? raw.colors.slice(0,5).map(x=>str(x,30)) : [],
    items,
    questions:Array.isArray(raw.questions)
      ? raw.questions.slice(0,5).map(x=>str(x,180)) : [],
    nails:Array.isArray(raw.nails)
      ? raw.nails.slice(0,10).map(x=>({
          position:str(x.position,20),
          description:str(x.description,120),
          effects:Array.isArray(x.effects)
            ? x.effects.slice(0,8).map(v=>str(v,25))
            : []
        })) : [],
    pricingStatus:"not_priced",
    requiresOwnerReview:true
  };
}

async function analyze(image,apiKey){
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/"
    + encodeURIComponent(MODEL) + ":generateContent";

  const body = {
    systemInstruction:{parts:[{text:PROMPT}]},
    contents:[{
      role:"user",
      parts:[
        {text:"請逐指分析這張美甲參考圖，回傳 JSON。"},
        {inlineData:{
          mimeType:image.mimeType,
          data:image.buffer.toString("base64")
        }}
      ]
    }],
    generationConfig:{
      responseMimeType:"application/json",
      temperature:0.15,
      maxOutputTokens:4096
    }
  };

  for(let attempt=1;attempt<=2;attempt++){
    let response;

    try{
      response = await fetch(endpoint,{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-goog-api-key":apiKey
        },
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(25000)
      });
    }catch(error){
      if(attempt===2){
        return {
          ok:false,status:504,
          error:"AI 連線逾時，請稍後重新分析"
        };
      }
      continue;
    }

    if(response.status===429){
      return {
        ok:false,status:429,
        error:"Gemini 使用額度或頻率達上限，請稍後再試",
        retryAfter:60
      };
    }

    if(!response.ok){
      if(response.status>=500 && attempt===1){
        await new Promise(r=>setTimeout(r,1000));
        continue;
      }

      return {
        ok:false,status:502,
        error:"Gemini 分析失敗（"+response.status+"）"
      };
    }

    const payload = await response.json();
    const content = payload.candidates?.[0]?.content?.parts
      ?.map(x=>x.text||"").join("");

    if(!content){
      return {
        ok:false,status:502,
        error:"AI 沒有回傳完整內容，請重新分析"
      };
    }

    try{
      const cleaned = content
        .replace(/^```(?:json)?\s*/i,"")
        .replace(/\s*```$/,"");

      const data = cleanResult(JSON.parse(cleaned));

      return {ok:true,data};
    }catch{
      return {
        ok:false,status:502,
        error:"AI 回傳資料不完整，請重新分析"
      };
    }
  }

  return {
    ok:false,status:502,
    error:"分析失敗"
  };
}

export default async function handler(req,res){
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return send(res,405,{error:"僅接受 POST"});
  }

  try{
    if(!await verifyOwner(req)){
      return send(res,403,{
        error:"請使用村長帳號登入"
      });
    }

    const key=process.env.GEMINI_API_KEY;

    if(!key){
      return send(res,503,{
        error:"GEMINI_API_KEY 尚未設定"
      });
    }

    let image;

    try{
      image=await getImage(req.body);
    }catch(error){
      return send(res,400,{error:error.message});
    }

    const result=await analyze(image,key);

    if(!result.ok){
      return send(res,result.status,{
        error:result.error,
        retryAfter:result.retryAfter||null
      });
    }

    return send(res,200,{
      ...result.data,
      model:MODEL
    });

  }catch(error){
    console.error("AI analysis:",error.message);

    return send(res,500,{
      error:"系統暫時無法分析，請稍後重試"
    });
  }
}
