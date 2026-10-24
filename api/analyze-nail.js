
/*
 * XIANG BEAUTY AI ANALYSIS V2.1
 * OpenRouter 優先 / Gemini 備援
 * 僅供 feature/ai-nail-consultation 測試分支使用
 */

const OWNER_UID = "T9nwxBSXqKYWVsS6dmEN62tpt232";
const CLOUD_NAME = "mby1sz4i";
const MAX_BYTES = 4 * 1024 * 1024;

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
  const token=String(req.headers.authorization||"")
    .match(/^Bearer\s+(\S+)$/i)?.[1];

  if(!token)return false;

  const key=process.env.FIREBASE_WEB_API_KEY;

  if(!key)throw Error("Firebase API Key 未設定");

  const response=await fetch(
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="
    +encodeURIComponent(key),
    {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({idToken:token}),
      signal:AbortSignal.timeout(10000)
    }
  );

  if(!response.ok)return false;

  const data=await response.json();
  const user=data.users?.[0];

  return Boolean(
    user &&
    user.localId===OWNER_UID &&
    user.disabled!==true
  );
}

function validImageUrl(value){
  try{
    const u=new URL(value);

    return (
      u.protocol==="https:" &&
      u.hostname==="res.cloudinary.com" &&
      !u.port &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      u.pathname.startsWith(
        "/"+CLOUD_NAME+"/image/upload/"
      ) &&
      u.pathname.includes(
        "/xiang-beauty-artworks/"
      )
    );
  }catch{
    return false;
  }
}

async function getImage(body){
  if(typeof body?.imageData==="string"){
    const match=body.imageData.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
    );

    if(!match){
      throw Error("圖片格式不正確");
    }

    if(match[2].length>MAX_BYTES*1.4){
      throw Error("圖片太大，請重新選擇");
    }

    const buffer=Buffer.from(match[2],"base64");

    if(!buffer.length||buffer.length>MAX_BYTES){
      throw Error("圖片不可超過 4MB");
    }

    return {
      buffer,
      mimeType:match[1]
    };
  }

  if(!validImageUrl(body?.imageUrl)){
    throw Error("請提供有效的美甲圖片");
  }

  const response=await fetch(body.imageUrl,{
    redirect:"error",
    signal:AbortSignal.timeout(12000)
  });

  if(!response.ok){
    throw Error("無法讀取圖片");
  }

  const length=Number(
    response.headers.get("content-length")||0
  );

  if(length>MAX_BYTES){
    throw Error("圖片不可超過 4MB");
  }

  const mimeType=String(
    response.headers.get("content-type")||""
  ).split(";")[0].toLowerCase();

  if(![
    "image/jpeg","image/png","image/webp"
  ].includes(mimeType)){
    throw Error("不支援此圖片格式");
  }

  const buffer=Buffer.from(
    await response.arrayBuffer()
  );

  if(buffer.length>MAX_BYTES){
    throw Error("圖片不可超過 4MB");
  }

  return {buffer,mimeType};
}

const PROMPT=`
你是台灣專業美甲師，也是香香村美妍製造所的
AI 美甲圖片辨識助手。

請以繁體中文回答。
只回傳 JSON，不要 Markdown，不要解釋文字。

【任務一：確認圖片】
辨識是否為美甲作品。
若不是，isNailImage=false。
不可將背景、衣服或其他物品當作指甲。

【任務二：逐指分析】
辨識照片實際可見的每一指。
判斷顏色、質地、底款、裝飾與施工方式。
看不到的手指不可虛構。

例如：
五指中三指單色、兩指暈染：
base="solid"
items 中 blend count=2

【任務三：計價技術分類】
base 只能為：
solid、cat、mirror、french、partial、unknown

zone 只能為：
hand、foot、unknown

items.id 只能為：
${IDS.join(",")}

count 代表照片實際可見的施工指數。
gem 可以是鑽飾顆數。
jump 代表跳色項目，不是每一指都收一次。
若有跳色，jump 的 count 一律為 1。

整手貓眼不可以再重複算單指貓眼。
整手鏡面不可以再重複算單指鏡面。

只分析施工技術，不計算金額。
不推估另一手。

【任務四：流行美甲風格】
styleName 請使用符合圖片氛圍的
小紅書流行美甲命名。

例如：
奶呼呼、溫柔御姐、韓系千金、
美拉德、清冷高級感、暗黑星河、
甜酷辣妹、靜奢裸感、果凍透感。

styleTags 產生 2 至 5 個短標籤。
colors 產生 1 至 5 個顏色或質地標籤。
不可把施工計價名稱當成風格名稱。

【任務五：信心與待確認項目】
無法看清楚時，confidence="low"。
有不確定的地方，寫入 questions。
不能假裝已經辨識完整。

JSON 格式：

{
  "isNailImage":true,
  "zone":"hand",
  "base":"solid",
  "visibleNails":5,
  "summary":"照片中款式的客觀說明",
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
      "description":"焦糖棕單色",
      "effects":["solid"]
    }
  ]
}
`;

function cleanResult(raw){
  const allowed=new Set(IDS);
  const str=(v,n=160)=>String(v||"").slice(0,n);

  const merged=new Map();

  if(Array.isArray(raw.items)){
    for(const item of raw.items){
      if(!item||!allowed.has(item.id))continue;

      const count=Number(item.count);

      if(!Number.isInteger(count)||
         count<1||count>50)continue;

      const old=merged.get(item.id);

      merged.set(item.id,{
        id:item.id,
        count:item.id==="jump"
          ?1
          :Math.min(50,(old?.count||0)+count),
        confidence:["high","medium","low"]
          .includes(item.confidence)
          ?item.confidence:"low",
        reason:str(item.reason)
      });
    }
  }

  const zone=["hand","foot","unknown"]
    .includes(raw.zone)?raw.zone:"unknown";

  const base=[
    "solid","cat","mirror",
    "french","partial","unknown"
  ].includes(raw.base)?raw.base:"unknown";

  const visibleNails=Number.isInteger(raw.visibleNails)
    ?Math.max(0,Math.min(10,raw.visibleNails))
    :0;

  return {
    isNailImage:raw.isNailImage===true,
    zone,
    base,
    visibleNails,
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
  if(typeof text!=="string"||!text.trim()){
    throw Error("AI 沒有回傳分析內容");
  }

  let cleaned=text.trim()
    .replace(/^```(?:json)?\s*/i,"")
    .replace(/\s*```$/,"");

  try{
    return cleanResult(JSON.parse(cleaned));
  }catch{
    const first=cleaned.indexOf("{");
    const last=cleaned.lastIndexOf("}");

    if(first<0||last<=first){
      throw Error("AI 回傳內容不是有效 JSON");
    }

    return cleanResult(
      JSON.parse(cleaned.slice(first,last+1))
    );
  }
}

async function callOpenRouter(image,key){
  const dataUrl=
    "data:"+image.mimeType+";base64,"
    +image.buffer.toString("base64");

  const response=await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method:"POST",
      headers:{
        "Authorization":"Bearer "+key,
        "Content-Type":"application/json",
        "HTTP-Referer":"https://xiang-beauty-studio.vercel.app",
        "X-Title":"Xiang Beauty AI Nail Analysis"
      },
      body:JSON.stringify({
        model:OPENROUTER_MODEL,
        messages:[
          {
            role:"system",
            content:PROMPT
          },
          {
            role:"user",
            content:[
              {
                type:"text",
                text:"請完整分析這張美甲照片，僅輸出 JSON。"
              },
              {
                type:"image_url",
                image_url:{
                  url:dataUrl
                }
              }
            ]
          }
        ],
        temperature:0.15,
        max_tokens:2500
      }),
      signal:AbortSignal.timeout(22000)
    }
  );

  if(!response.ok){
    const error=await response.text();

    console.error(
      "OpenRouter HTTP",
      response.status,
      error.slice(0,350)
    );

    throw Error(
      "OpenRouter HTTP "+response.status
    );
  }

  const payload=await response.json();

  const content=payload.choices?.[0]?.message?.content;

  const text=typeof content==="string"
    ?content
    :Array.isArray(content)
      ?content.map(x=>x.text||"").join("")
      :"";

  return {
    data:parseAnalysis(text),
    model:payload.model||OPENROUTER_MODEL,
    provider:"OpenRouter"
  };
}

async function callGemini(image,key){
  const endpoint=
    "https://generativelanguage.googleapis.com/v1beta/models/"
    +encodeURIComponent(GEMINI_MODEL)
    +":generateContent";

  const response=await fetch(endpoint,{
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
          {
            text:"請逐指分析照片，只輸出 JSON。"
          },
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
    signal:AbortSignal.timeout(22000)
  });

  if(!response.ok){
    const error=await response.text();

    console.error(
      "Gemini HTTP",
      response.status,
      error.slice(0,350)
    );

    throw Error(
      "Gemini HTTP "+response.status
    );
  }

  const payload=await response.json();

  const text=payload.candidates?.[0]?.content?.parts
    ?.map(x=>x.text||"").join("")||"";

  return {
    data:parseAnalysis(text),
    model:GEMINI_MODEL,
    provider:"Gemini"
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
      console.error(
        "OpenRouter failed:",
        error.message
      );
    }
  }else{
    errors.push("OpenRouter API Key 未設定");
  }

  if(geminiKey){
    try{
      return await callGemini(image,geminiKey);
    }catch(error){
      errors.push(error.message);
      console.error(
        "Gemini failed:",
        error.message
      );
    }
  }else{
    errors.push("Gemini API Key 未設定");
  }

  return {
    failed:true,
    errors
  };
}

export default async function handler(req,res){
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return send(res,405,{
      error:"僅接受 POST"
    });
  }

  try{
    const authorized=await verifyOwner(req);

    if(!authorized){
      return send(res,403,{
        error:"請使用村長帳號登入"
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
      const errors=result.errors.join("；");

      console.error(
        "All AI providers failed:",
        errors
      );

      return send(res,503,{
        error:
          "OpenRouter 與 Gemini 均未完成辨識。"
          +"請稍後重試，或檢查模型與免費額度。",
        details:errors
      });
    }

    return send(res,200,{
      ...result.data,
      provider:result.provider,
      model:result.model
    });

  }catch(error){
    console.error(
      "AI analysis system:",
      error.message
    );

    return send(res,500,{
      error:"系統暫時無法分析，請稍後再試"
    });
  }
}
