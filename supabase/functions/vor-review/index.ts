import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REFERENCE = `
КАТАЛОГ ШАБЛОНОВ (tplKey → название):
spk_profile=Профиль стойка-ригель; spk_glass=Стеклопакет; spk_broneplenka=Бронеплёнка; spk_hardware=Фурнитура; pvh_profile=ПВХ окна;
nvf_subsystem=Подсистема НВФ; insulation=Утеплитель;
nvf_cladding_clinker=Клинкер; nvf_cladding_cassette=Кассеты; nvf_cladding_concrete_tile=Бетонная плитка; nvf_cladding_fibrobeton=Фибробетон;
nvf_cladding_ceramic=Керамика; nvf_cladding_porcelain=Керамогранит; nvf_cladding_natural_stone=Натур. камень; nvf_cladding_akp=АКП;
nvf_cladding_fcp=ФЦП; nvf_cladding_galvanized=Оцинков. лист; nvf_cladding_arch_concrete=Арх. бетон; nvf_cladding_brick=Кирпич;
nvf_cladding_profiles_vertical=Верт./декор. профили;
wet_facade=Мокрый фасад (всё в одном); wet_facade_insulation=Мокрый утеплитель; wet_facade_finish=Штукатурный слой; wet_facade_paint=Окраска;
flashings=Откосы/отливы; pp_otsechi=П/П отсечки;
glass_railing=Стекл. ограждения; glass_railing_molled=Молл. (гнутое) ограждение; glass_canopy=Козырёк (триплекс);
vent_grilles=Вентрешётки;
scaffolding=Леса; kmd_spk=КМД СПК; kmd_nvf=КМД НВФ;
doors_entrance=Двери входные; doors_tambour=Тамбурные двери; mockup=Мокап.

КЛЮЧЕВЫЕ ПРАВИЛА:
1. Мокрый vs НВФ. Сигналы мокрого: "по системе", "Технониколь", "ROCKglue/ROCKforce", клей, шпаклёвка, сетка, штукатурка, краска → wet_facade (БЕЗ nvf_subsystem).
2. Откосы из кассеты/керамики БЕЗ явного "утеплитель NNN мм" → [nvf_subsystem, nvf_cladding_*, pp_otsechi] БЕЗ insulation. Откосы мокрого → [wet_facade, pp_otsechi].
3. "Декоративный профиль" в м.п. в составе НВФ → nvf_cladding_profiles_vertical, НЕ spk_profile (это деталь фасада, не стойко-ригель).
4. "Решётка" в м² внутри фасада/лоджии → это ПОЛНЫЙ НВФ: [nvf_subsystem, insulation, nvf_cladding_cassette, scaffolding, kmd_nvf]. Одиночные вентрешётки в витраже → vent_grilles.
5. Рельеф ≠ толщина утеплителя. "Рельеф 50 мм" — это высота рисунка панели. Утеплитель берётся из явного "толщина 180 мм" / "минвата" / "эппс".
6. Ограждения: стекло прямое → glass_railing; молл/гнутое/криволинейное → glass_railing_molled. Козырёк → glass_canopy (даже если стеклянный и похож на витраж).
7. Тамбур → [spk_profile, doors_tambour, spk_glass, spk_broneplenka, scaffolding, kmd_spk]. Двери входные → doors_entrance + СПК-обвязка. Не путать tambour и entrance.
8. Вторичные (scaffolding, kmd_spk, kmd_nvf) добавляются только к полным системам: НВФ, витраж, окна, двери, тамбура. НЕ к одиночным откосам/отливам/ограждениям/решёткам в витраже.
9. Составная позиция ("НВФ: керамика + подсистема + утеплитель 180") → все три: [nvf_subsystem, insulation, nvf_cladding_ceramic]. Частичная ("только облицовка") → только один.
10. Явные ключи: керамогранит→porcelain; клинкер→clinker; фибробетон→fibrobeton; АКП→akp; ФЦП→fcp; натур. камень→natural_stone; кирпич→brick. Fallback "кассета" → cassette.
11. "Фурнитура" → добавить spk_hardware к СПК-комплекту.

ЭТАЛОННЫЕ ПРИМЕРЫ:
• "НВФ. Керамика, подсистема НФС, утеплитель 180 мм" → [nvf_subsystem, insulation, nvf_cladding_ceramic, scaffolding, kmd_nvf]
• "НВФ. Алюм. кассеты, подсистема, без утеплителя" → [nvf_subsystem, nvf_cladding_cassette, scaffolding, kmd_nvf]
• "Мокрый фасад по системе Технониколь, утеплитель, окраска" → [wet_facade]
• "Откосы кассетные, подсистема" → [nvf_subsystem, nvf_cladding_cassette, pp_otsechi]
• "Витраж стойко-ригель" (позиция, не заголовок) → [spk_profile, spk_glass, spk_broneplenka, scaffolding, kmd_spk]
• "Стеклопакет" (самостоятельная подпозиция) → [spk_glass]
• "Тамбур вход. группы" → [spk_profile, doors_tambour, spk_glass, spk_broneplenka, scaffolding, kmd_spk]
• "Окна ПВХ" → [pvh_profile]
• "Вентрешётка алюминиевая в витраже" → [vent_grilles]
• "Ограждение балконное, триплекс" → [glass_railing]
• "Молл-ограждение гнутое" → [glass_railing_molled]
• "Козырёк входной, стекло триплекс" → [glass_canopy]
• "Декор. профили 50×200 в составе НВФ из кассет" → [nvf_cladding_profiles_vertical] (плюс основная облицовка где-то рядом)
• "Отливы оконные" → [flashings]

ЧАСТЫЕ ОШИБКИ:
• Мокрый фасад подмечен как НВФ → red. Триггер: "по системе", "клей", бренды ТН/ROCK*.
• insulation добавлен к откосам без явного утеплителя → yellow/red.
• "Решётка под лоджиями" без НВФ-подсистемы → red (нужен полный НВФ).
• "Светопрозрачные двери" без doors_entrance → yellow.
• "Декоративный профиль" записан как spk_profile → red.
`.trim();

const SYSTEM_PROMPT = `Ты — опытный инженер-сметчик по фасадам. Проверяешь, правильно ли наш движок подобрал шаблоны работ для позиции ВОР (Ведомость Объёмов Работ) жилого/коммерческого здания.

${REFERENCE}

На входе получишь:
1) noteCustomer — формулировка заказчика (русский текст из проекта)
2) tplKeys — массив ключей шаблонов, которые подобрал наш движок
3) posCode — код позиции (опц.), costPath — путь затрат (опц.)

Твоя задача: оценить, подходит ли набор шаблонов под описание. Используй справочник выше — сверяй с правилами и эталонными примерами. Особое внимание:
— полный ли состав (НВФ = подсистема + облицовка + утеплитель, если он явно указан);
— нет ли лишнего (например insulation, когда заказчик его не называл);
— не перепутан ли тип (мокрый ↔ НВФ, тамбур ↔ вход, декор. профиль ↔ СПК-профиль);
— нужны ли вторичные шаблоны (scaffolding, kmd_*) в этой ситуации.

Ответ — СТРОГО валидный JSON без комментариев и без markdown. ПОЛЯ В ТОЧНО ТАКОМ ПОРЯДКЕ:
{"reasoning":"...","score":0-100,"comment":"..."}

reasoning — ОБЯЗАТЕЛЬНО пиши ПЕРВЫМ. Пошаговый разбор позиции, 3-6 предложений, 300-600 символов. Формат: (1) что это за конструкция по описанию заказчика (НВФ / мокрый / СПК / откос / ограждение / ...), (2) какие признаки ты видишь (материал облицовки, наличие/отсутствие утеплителя, явные бренды/системы), (3) какие правила из справочника применимы, (4) что в подобранном наборе шаблонов движком правильно, что сомнительно, чего не хватает или что лишнее. Думай как инженер-сметчик, а не как машина — учитывай контекст всей позиции, а не только ключевые слова.

score — ОДНО ЧИСЛО 0..100, оценка КАЧЕСТВА подбора (не уверенности!). Шкала:
• 90-100 — идеальный подбор, все шаблоны на месте, лишнего нет
• 70-89  — в целом верно, возможны мелкие недочёты (лишний вторичный, пропущенный второстепенный)
• 40-69  — сомнительно, серьёзно стоит проверить вручную (неправильный тип облицовки / спорный утеплитель / пересечение шаблонов)
• 15-39  — ошибка, большая часть подбора неверна (например, мокрый записан как НВФ, тамбур как витраж)
• 0-14   — полный мисс, ничего общего с тем что нужно

Вердикт (🟢/🟡/🔴) клиент выводит сам из score по диапазонам — тебе отдельно ставить его НЕ НУЖНО. Чем хуже подбор — тем ниже score.

comment — одно-два предложения, максимум 220 символов, краткое резюме из reasoning: если score высокий — суть совпадения, если низкий — что именно не так и как правильно.

ЖЁСТКОЕ ПРАВИЛО ЯЗЫКА: ВСЕ поля (reasoning и comment) ТОЛЬКО по-русски, без единого английского слова, без латиницы кроме tplKey-ключей и брендов (Rockwool, Технониколь, ROCKglue и т.п.). Не пиши "OK", "correct", "mismatch", "verify" — пиши "верно", "ошибка", "не подходит", "проверить".`;

type Payload = {
  noteCustomer?: string;
  tplKey?: string; // legacy
  tplKeys?: string[];
  costPath?: string;
  posCode?: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Ошибка возвращается как валидный ответ (HTTP 200) с score=50 (жёлтый) и причиной в comment —
// supabase-js не может прочитать тело non-2xx ответа, а нам нужно видеть причину на клиенте.
function errorResult(reason: string, posCode?: string | null) {
  return jsonResponse({
    score: 50,
    verdict: "yellow",
    comment: `Отладка: ${reason}`.slice(0, 300),
    reasoning: "",
    posCode: posCode ?? null,
    tokens: { input: null, output: null },
  });
}

function verdictFromScore(s: number): "green" | "yellow" | "red" {
  if (s >= 70) return "green";
  if (s >= 40) return "yellow";
  return "red";
}

type FeedbackRow = {
  note_customer: string | null;
  pos_name: string | null;
  engine_tpl_keys: string[] | null;
  correct_tpl_keys: string[] | null;
  user_is_correct: boolean;
  user_comment: string | null;
};

async function loadSimilarFeedback(req: Request, query: string): Promise<FeedbackRow[]> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !key) return [];
    const authHeader = req.headers.get("Authorization") ?? "";
    const client = createClient(url, key, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await client.rpc("find_similar_feedback", {
      query_text: query,
      lim: 3,
    });
    if (error) {
      console.log("find_similar_feedback error:", error.message);
      return [];
    }
    return Array.isArray(data) ? (data as FeedbackRow[]) : [];
  } catch (err) {
    console.log("loadSimilarFeedback exception:", String(err));
    return [];
  }
}

function formatSimilarFeedback(rows: FeedbackRow[]): string {
  if (rows.length === 0) return "";
  const lines: string[] = [];
  lines.push("\nПОХОЖИЕ СЛУЧАИ ИЗ ИСТОРИИ ЭТОГО ПОЛЬЗОВАТЕЛЯ (учитывай их — пользователь уже размечал похожие позиции):");
  rows.forEach((r, i) => {
    const descr = (r.pos_name || r.note_customer || "").slice(0, 140);
    const engine = (r.engine_tpl_keys || []).join(", ");
    if (r.user_is_correct) {
      lines.push(`${i + 1}. [ВЕРНО ✓] "${descr}" — движок подбирал [${engine}], пользователь подтвердил.`);
    } else {
      const correct = (r.correct_tpl_keys || []).join(", ");
      const note = r.user_comment ? ` Коммент: "${r.user_comment}"` : "";
      lines.push(`${i + 1}. [ОШИБКА ✗] "${descr}" — движок подбирал [${engine}], правильно было: [${correct}].${note}`);
    }
  });
  return lines.join("\n");
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

  const { noteCustomer, tplKey, tplKeys, costPath, posCode } = payload;
  const keys = Array.isArray(tplKeys) && tplKeys.length > 0
    ? tplKeys
    : (tplKey ? [tplKey] : []);
  if (!noteCustomer || keys.length === 0) {
    return errorResult("пустые noteCustomer или tplKeys", posCode);
  }

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return errorResult("в секретах функции нет OPENROUTER_API_KEY", posCode);
  }

  // RAG: тянем похожие размеченные случаи и подмешиваем в user-message
  const similar = await loadSimilarFeedback(req, noteCustomer);
  const similarBlock = formatSimilarFeedback(similar);

  const userMessage = [
    `Позиция: ${posCode ?? "без кода"}`,
    `Описание заказчика: "${noteCustomer}"`,
    `Подобранные шаблоны движка: [${keys.join(", ")}]`,
    `Путь затрат: ${costPath ?? "не указан"}`,
    similarBlock,
  ].filter(Boolean).join("\n");

  let orRes: Response;
  try {
    orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://facade-hub.local",
        "X-Title": "Facade_HUB VOR Review",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 700,
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

  let parsed: { reasoning?: string; score?: number; comment?: string };
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

  let score =
    typeof parsed.score === "number" ? Math.round(parsed.score) : 50;
  if (!Number.isFinite(score) || score < 0) score = 0;
  if (score > 100) score = 100;
  const verdict = verdictFromScore(score);

  const comment =
    typeof parsed.comment === "string" && parsed.comment.trim()
      ? parsed.comment.trim().slice(0, 300)
      : "Не удалось прочитать ответ модели.";

  const reasoning =
    typeof parsed.reasoning === "string" && parsed.reasoning.trim()
      ? parsed.reasoning.trim().slice(0, 1200)
      : "";

  return jsonResponse({
    score,
    verdict,
    comment,
    reasoning,
    posCode: posCode ?? null,
    tokens: {
      input: orData?.usage?.prompt_tokens ?? null,
      output: orData?.usage?.completion_tokens ?? null,
    },
  });
});
