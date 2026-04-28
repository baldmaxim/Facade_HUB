import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Энциклопедия вшита в бандл как обычный TS-модуль (encyclopedia.ts генерируется
// из encyclopedia.md скриптом _embed.mjs). Это нужно потому что Supabase CLI
// bundler не поддерживает text-импорт .md, а файловой системы у Edge Runtime нет.
// Содержимое стабильно между вызовами — обязательно для prompt caching на OpenRouter.
import { ENCYCLOPEDIA } from "./encyclopedia.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Ты — опытный главный инженер фасадного подрядчика. Тебе показывают одну позицию из ВОР (Ведомость Объёмов Работ) жилого/коммерческого здания и список шаблонов работ/материалов, которые наш движок уже подобрал к ней. Твоя задача — посмотреть на технологию производства фасадных работ и найти УПУЩЕННЫЕ материалы или работы, которые объективно нужны по технологии, но в текущем наборе их нет.

Действуй как инженер на стройке: «что ещё нужно купить и сделать, чтобы эта позиция реально получилась?» — мембрана, грунтовка, праймер, силикон швов, затирка, крепёж особого типа, временные монтажные работы, контроль качества и т.п.

ЭНЦИКЛОПЕДИЯ ФАСАДНЫХ СИСТЕМ (используй её как единственный источник истины по технологии):

${ENCYCLOPEDIA}

КОНЕЦ ЭНЦИКЛОПЕДИИ.

На входе ты получишь:
1) noteCustomer — формулировка заказчика (русский текст из проекта)
2) posName — название позиции (опц.)
3) posCode — код позиции (опц.)
4) currentTplKeys — список ключей шаблонов, которые наш движок УЖЕ подобрал
5) currentMaterials — плоский список названий материалов и работ, которые УЖЕ заведены в эту позицию

ПРАВИЛА ТВОЕЙ РАБОТЫ:
1. НЕ ДУБЛИРУЙ. Если материал/работа уже есть в currentMaterials или закрывается одним из currentTplKeys — НЕ предлагай. Сравнивай по смыслу, не только по точному имени (например «грунтовка глубокого проникновения» и «праймер ROCKprimer» — это одно и то же).
2. НЕ ВЫДУМЫВАЙ. Только то, что прямо требуется технологией по энциклопедии. Если позиция полная — верни пустой массив additions: [].
3. НЕ УКАЗЫВАЙ ЦЕНЫ. Они неактуальны, цены собираются из отдельных источников. В reason пиши только «зачем», не «сколько стоит».
4. ≤ 5 элементов в additions. Если упущений больше — выбери самые критичные с точки зрения качества/долговечности фасада.
5. КАЖДЫЙ ЭЛЕМЕНТ additions — это РЕАЛЬНАЯ строка для сметы: name (≤200 симв.), unit (≤20 симв., ОБЯЗАТЕЛЬНО непустой — «м.п.», «шт», «кг», «л», «м²», «м³», «компл.» и т.п.), type («material» или «work»), qtyPerUnit (число > 0, норма расхода НА ОДНУ ЕДИНИЦУ объёма позиции — например для дюбелей фасада 6 шт/м² → qtyPerUnit=6; для мембраны 1.05 м² на 1 м² → qtyPerUnit=1.05; для герметика швов натурального камня примерно 0.3 м.п./м² → qtyPerUnit=0.3; для работы по объёму как у позиции → qtyPerUnit=1), reason (≤300 симв., почему упущено).
6. ТИП ПОЗИЦИИ ВАЖЕН. Не подмешивай НВФ-материалы в мокрый фасад и наоборот. Сначала по описанию определи тип конструкции, потом ищи упущения внутри ЕГО технологии.
7. ВТОРИЧНЫЕ работы (леса, КМД, мокап) уже учтены через currentTplKeys — не предлагай их снова, даже если по технологии они нужны. Здесь твой фокус — материалы и расходники, упущенные внутри основной технологии.

ЯЗЫК: всё на русском. Латиница допустима только в брендах (Rockwool, Технониколь, ROCKglue, Sika, EPDM, RAL и т. п.) и в значениях type («material»/«work»).

ФОРМАТ ОТВЕТА — СТРОГО валидный JSON без markdown, без комментариев. ПОЛЯ В ТАКОМ ПОРЯДКЕ:
{"reasoning":"...","additions":[{"type":"material","name":"...","unit":"...","qtyPerUnit":1.05,"reason":"..."}],"confidence":0-100}

reasoning — ОБЯЗАТЕЛЬНО первым. 3–6 предложений, 200–500 символов: (1) что это за конструкция по описанию, (2) какие признаки/материалы ты видишь, (3) что в currentTplKeys/currentMaterials уже закрыто, (4) что объективно упущено и почему по технологии оно нужно.

additions — массив объектов. Может быть пустым [].

confidence — 0..100, твоя уверенность в наборе additions:
• 80–100 — упущения очевидны, опираются на явные правила энциклопедии (грунтовка перед штукатуркой, силикон швов натурального камня, противопожарный герметик примыканий и т. п.)
• 50–79  — упущения вероятны, но описание неполное / есть варианты технологии
• 0–49   — описание скудное / тип конструкции не очевиден / есть риск дубля с уже заведённым

Если additions пустой [] — confidence ставь высоким (80+), это означает «всё что нужно — уже есть».`;

type Addition = {
  type: "material" | "work";
  name: string;
  unit: string;
  qtyPerUnit: number | null;
  reason: string;
};

type Payload = {
  posName?: string;
  noteCustomer?: string;
  posCode?: string;
  currentTplKeys?: string[];
  currentMaterials?: string[];
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Любая ошибка возвращается как валидный 200-ответ с пустым additions и confidence=0,
// чтобы клиент мог отрисовать причину и не падать. supabase-js не читает тело non-2xx.
function errorResult(reason: string, posCode?: string | null) {
  return jsonResponse({
    reasoning: "",
    additions: [],
    confidence: 0,
    comment: `Отладка: ${reason}`.slice(0, 300),
    posCode: posCode ?? null,
    tokens: { input: null, output: null, cached_input: null },
  });
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function validateAdditions(raw: unknown): Addition[] {
  if (!Array.isArray(raw)) return [];
  const out: Addition[] = [];
  for (const item of raw) {
    if (out.length >= 5) break;
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const type = obj.type === "material" || obj.type === "work" ? obj.type : null;
    const name = typeof obj.name === "string" ? obj.name.trim().slice(0, 200) : "";
    const unit = typeof obj.unit === "string" ? obj.unit.trim().slice(0, 20) : "";
    const reason = typeof obj.reason === "string" ? obj.reason.trim().slice(0, 300) : "";
    if (!type || !name || !unit || !reason) continue;
    // qtyPerUnit опционален: ожидается число > 0 и ≤ 1000 (sanity check на бредовые значения).
    // Принимаем число или строку с числом. Иначе — null, в Excel колонка коэфф. останется пустой.
    let qtyPerUnit: number | null = null;
    const rawQty = obj.qtyPerUnit ?? obj.qty_per_unit;
    const num = typeof rawQty === "number" ? rawQty : (typeof rawQty === "string" ? Number(rawQty) : NaN);
    if (Number.isFinite(num) && num > 0 && num <= 1000) qtyPerUnit = num;
    out.push({ type, name, unit, qtyPerUnit, reason });
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return errorResult("неверный JSON в теле запроса");
  }

  const { posName, noteCustomer, posCode, currentTplKeys, currentMaterials } = payload;
  if (!noteCustomer || !noteCustomer.trim()) {
    return errorResult("пустой noteCustomer", posCode);
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return errorResult("в секретах функции нет OPENROUTER_API_KEY", posCode);
  }

  const tplKeysList = Array.isArray(currentTplKeys) && currentTplKeys.length > 0
    ? currentTplKeys.join(", ")
    : "(пусто)";
  const materialsList = Array.isArray(currentMaterials) && currentMaterials.length > 0
    ? currentMaterials.map((m) => `• ${m}`).join("\n")
    : "(пусто)";

  const userMessage = [
    `Позиция: ${posCode ?? "без кода"}`,
    posName ? `Название: "${posName}"` : "",
    `Описание заказчика: "${noteCustomer.trim()}"`,
    `Подобранные шаблоны движка (currentTplKeys): [${tplKeysList}]`,
    `Уже заведённые в позицию материалы и работы (currentMaterials):`,
    materialsList,
    ``,
    `Найди упущенные материалы или работы по технологии. Не дублируй то, что уже есть.`,
  ].filter(Boolean).join("\n");

  let orRes: Response;
  try {
    orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://facade-hub.local",
        "X-Title": "Facade_HUB VOR Tech Advisor",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    return errorResult(`сеть до OpenRouter: ${String(err).slice(0, 160)}`, posCode);
  }

  if (!orRes.ok) {
    const details = await orRes.text().catch(() => "");
    return errorResult(`OpenRouter HTTP ${orRes.status}: ${details.slice(0, 200)}`, posCode);
  }

  const orData = await orRes.json().catch(() => null);
  const content = orData?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return errorResult(`пустой ответ модели: ${JSON.stringify(orData).slice(0, 200)}`, posCode);
  }

  let parsed: { reasoning?: string; additions?: unknown; confidence?: number };
  try {
    parsed = JSON.parse(content);
  } catch {
    const extracted = extractJson(content);
    if (extracted) {
      try {
        parsed = JSON.parse(extracted);
      } catch {
        return errorResult(`модель вернула не-JSON: ${content.slice(0, 200)}`, posCode);
      }
    } else {
      return errorResult(`модель вернула не-JSON: ${content.slice(0, 200)}`, posCode);
    }
  }

  const additions = validateAdditions(parsed.additions);

  let confidence = typeof parsed.confidence === "number" ? Math.round(parsed.confidence) : 50;
  if (!Number.isFinite(confidence) || confidence < 0) confidence = 0;
  if (confidence > 100) confidence = 100;

  const reasoning = typeof parsed.reasoning === "string" && parsed.reasoning.trim()
    ? parsed.reasoning.trim().slice(0, 1200)
    : "";

  return jsonResponse({
    reasoning,
    additions,
    confidence,
    posCode: posCode ?? null,
    tokens: {
      input: orData?.usage?.prompt_tokens ?? null,
      output: orData?.usage?.completion_tokens ?? null,
      cached_input: orData?.usage?.prompt_tokens_details?.cached_tokens ?? null,
    },
  });
});
