# Project Memory

_Maintained at the end of each session. Contains decisions, results, open questions._

---

## Session 2026-04-28 (Фаза 6 — Б: requiredChain POC)

**Контекст:** продолжение Фазы 6 (после Фазы А с энциклопедией). Цель — детерминированный слой авто-добавления обязательных «спутников» технологии (силикон, затирка, мембрана) к главному шаблону без AI. POC на одной паре `nvf_cladding_natural_stone → stone_sealant` для доказательства работоспособности механизма.

**Done (Фаза 6-Б, коммит 36077ac, запушено в main):**
- `src/lib/vorTemplates.js`:
  - Новый шаблон-спутник `stone_sealant` (workMaterials: работа «Герметизация швов натурального камня» + материал «Силикон погодостойкий нейтральный (по проекту)», unit=м.п., j=1, k=1.05, без price).
  - Поле `requiredChain: ['stone_sealant']` в `nvf_cladding_natural_stone`.
- `src/lib/vorExcelGenerator.js`:
  - Pre-pass `primaryKeysInVor` (Set всех tplKeys, возвращаемых matchPos по любой позиции ВОРа) — рядом с существующим pre-pass `excludeFromSecondary`.
  - Функция `expandChain(tplKeys)` — глубина рекурсии 2, visited Set для защиты от циклов, троеуровневый фильтр (already added / `excludeFromSecondary` / `primaryKeysInVor`), финальный дедуп через `[...new Set(...)]`. Размещена ДО `getTemplate`.
  - Три точки интеграции (после каждого `filterExcluded`):
    1. `posInfos` pre-compute (split-3 подготовка, ~строка 296).
    2. split-3 work/material role (~488).
    3. simple mode (~638).
- Все 6 снапшотов прошли без регрессий — натуральный камень в них не используется.
- Build ок, lint чисто на наших файлах (другие ошибки pre-existing).
- Smoke-тест 1: синтетический ВОР с одной позицией натурального камня → в выводе появились ровно 2 новые строки (Герметизация швов + Силикон). Все остальные шаблоны (подсистема/утеплитель/леса/КМД) рендерятся как раньше.
- Smoke-тест 2: ВОР с двумя позициями (камень + override на stone_sealant) → внутри камня stone_sealant НЕ дублируется через primaryKeysInVor. Защита от дублей работает.

**Decisions (зафиксированы):**
- Глубина рекурсии цепочки = 2 (companion может иметь свой chain, но дальше не идём — артифакт защиты от ошибок в данных).
- `excludeFromSecondary` (по keyword из текста ВОРа) И `primaryKeysInVor` (companion заведён как primary) — два независимых фильтра в expandChain.
- workMaterials шаблонов (клинкер→затирка, утеплитель НВФ→мембрана+дюбели и т.п.) НЕ переписываем как requiredChain. requiredChain — только для НОВЫХ спутников (рендерится отдельной парой работа+материал).
- Custom-шаблоны из Supabase (vor_custom_templates) пока БЕЗ requiredChain — добавим в портал позже, если потребуется.

**Кандидаты на следующую сессию Фазы Б** (~10 пар, нужны новые шаблоны-спутники):
1. `nvf_cladding_brick` → новый `brick_grout` (фугование швов кирпичной кладки)
2. `nvf_cladding_cassette` / `nvf_cladding_akp` → новый `cassette_edges` (торцевые/угловые планки + заклёпки)
3. `nvf_cladding_fcp` (фиброцемент) → новый `fcp_edges` (стартовые/финишные планки)
4. `wet_facade_finish` (декор. штукатурка) → новый `wet_primer` (грунтовка под финиш)
5. `glass_railing` / `glass_canopy` → новый `silicone_edge` (герметизация торцов стекла)
6. `pp_otsechi` → новый `fire_sealant` (огнестойкий герметик в стык с мембраной — внимание: не пересекается с уже существующим СТИЗ-А/В в pp_otsechi, это другой герметик)
7. Витраж стоечно-ригельный → новый `vitrage_perimeter_sealant` (герметик примыкания к монолиту)
8. Окно/витраж → новый `window_seam` (ПСУЛ + пена + пароизоляция, 3-слойный шов по ГОСТ 30971)
9. Тамбур / наружная дверь → новый `door_closer_kit` (доводчик + порог)
10. `scaffolding` (леса) → новый `scaffolding_protection` (защитная сетка + козырёк над пешеходными зонами)

**Open (Фазы В, Г — следующие сессии):**
- **Фаза В (1 сессия):** Edge Function `supabase/functions/vor-tech-advisor/index.ts`. Копирование паттернов из `vor-review/index.ts` (CORS 4-9, errorResult 197-215, extractJson 274-283, loadSimilarFeedback 232-272, OpenRouter fetch 342-359). Энциклопедия из `supabase/functions/vor-tech-advisor/encyclopedia.md` встраивается в **system message** через `Deno.readTextFileSync(new URL('./encyclopedia.md', import.meta.url))` — критично для prompt caching. Payload `{ posName, noteCustomer, posCode, currentTplKeys, currentMaterials }`. Response `{ reasoning, additions: [{type: 'material'|'work', name, unit, reason}], confidence: 0..100, posCode, tokens }`. Валидация: ≤5 additions, имена ≤200 символов, reason ≤300. `max_tokens: 500`, `temperature: 0.2`, model `google/gemini-2.5-flash`. Бюджет: ~$0.013 на ВОР 50 позиций с prompt caching. Verify: curl с тестовым payload (камень с currentTplKeys включая `nvf_cladding_natural_stone`) → ожидаем additions «затирка швов / откосы / отливы / угловые элементы». 2-й запрос подряд → tokens.cached_input > 0.
- **Фаза Г (1-2 сессии):** runner `vorTechAdvisorRunner.js` (паттерн `vorProposeRunner.js`). Третья кнопка `🔧 Найти упущенное` в `VorAiPanel.jsx`. Компонент `VorTechAdditionsRow.jsx` (паттерн `VorAltRow.jsx`, оранжевая рамка). State в `VorFillModal.jsx`: `advising`, `advisingProgress`, `techAdditions Map`, `expandedTech Set`. Apply → постпроцесс-цикл в `generateFilledVor` рендерит каждое добавление как отдельную строку. `VorFillModal.jsx` уже близок к лимиту — поднять `max-lines` 750→850.

**План в файле:** `C:\Users\Usrr\.claude\plans\parsed-stirring-hare.md` — план Фазы Б (выполнен).
**Предыдущий план:** `C:\Users\Usrr\.claude\plans\streamed-napping-thacker.md` — общий план всех 4 фаз (А/Б/В/Г), Фаза В детально расписана там.

**Handoff prompt:**
```
Продолжаем Facade_HUB. Фаза 6-Б завершена и запушена коммитом 36077ac:
работающий механизм requiredChain в движке ВОР (POC на паре nvf_cladding_natural_stone → stone_sealant), все снапшоты без регрессий, защита от дублей (primaryKeysInVor + excludeFromSecondary) проверена smoke-тестами. Энциклопедия из Фазы А лежит в src/data/encyclopediaFasad.md и supabase/functions/vor-tech-advisor/encyclopedia.md.

Прочти memory.md (последние 2 session-записи 2026-04-28: Фазы А и Б) и общий план в C:\Users\Usrr\.claude\plans\streamed-napping-thacker.md (там Фаза В детально расписана).

Сейчас на очереди — Фаза В: создание Edge Function `supabase/functions/vor-tech-advisor/index.ts`. Это AI-слой «Найти упущенное» через Gemini 2.5 Flash на OpenRouter. Скопируй паттерны из существующей `supabase/functions/vor-review/index.ts` (CORS, errorResult, extractJson, loadSimilarFeedback, OpenRouter fetch). Ключевые требования: энциклопедия в SYSTEM message для prompt caching, payload содержит currentTplKeys+currentMaterials чтобы AI не дублировал, response содержит additions: [{type, name, unit, reason}] с ≤5 элементами.

Начни с уточняющих вопросов: (1) деплоить через Supabase MCP сразу или сначала локально через `supabase functions serve`? (2) использовать тот же OpenRouter API key из env что и vor-review? Не коммитить без команды.
```

---

## Session 2026-04-28 (Фаза 6 — А: фасадная энциклопедия для AI-tech-advisor)

**Контекст:** пользователь хочет, чтобы AI-ревьюер мог давать комментарии не только по корректности подбора шаблонов, но и **по технологии** — предлагать упущенные материалы/работы (мембрана, грунтовка, затирка, силикон швов). Согласовали гибридную архитектуру (вариант №3): `requiredChain` в движке (детерминированный слой, ~90 % случаев) + новая Edge Function `vor-tech-advisor` с фасадной энциклопедией в base-prompt (умный слой, ~10 %).

Перед этим — подготовка энциклопедии. Старые `vor-engine/ENCYCLOPEDIA_FASAD.md` (1666 строк) и `_ADDON.md` (285) содержали устаревшие цены 2024–2025. Пользователь попросил объединить, почистить от цен, удалить оригиналы.

**Done (Фаза 6-А, коммит 4d59836):**
- `src/data/encyclopediaFasad.md` (596 строк, 14 разделов) — мастер-копия, без цен (35 оставшихся матчей `руб|₽|/м²|/шт|/кг` — это нормы расхода, не цены).
- `supabase/functions/vor-tech-advisor/encyclopedia.md` — копия для Edge Function, читается через `Deno.readTextFileSync`.
- Раздел 14 «Технологические цепочки» — таблица 25 пар «материал → обязательные спутники + обоснование». Покрытие: утеплитель НВФ/СФТК, ПСБ при h>28м, клинкер, натуральный камень, кирпич, кассеты, керамогранит, фиброцемент, стеклянные ограждения, козырьки (стекло+металл), откосы, отливы, штукатурка, противопожарные отсечки, витражи, окна, тамбура, двери, противопожарные двери EI 60, леса, СОФ, балконные/кровельные ограждения. **Это ядро для AI-промпта в Фазе В.**
- `vor-engine/ENCYCLOPEDIA_FASAD.md` и `_ADDON.md` удалены (были untracked).
- README.md — упоминание заменено на новый путь.

**Решения пользователя (фиксируем):**
- `requiredChain` в шаблонах — только для **НОВЫХ** спутников. `workMaterials` (clinker → затирка уже встроена) **НЕ трогаем**.
- Tech-advisor — **отдельная** Edge Function `vor-tech-advisor`, не третий mode в `vor-review`.
- Старые энциклопедии после слияния — **удалить** (история в git).

**Open (Фазы Б, В, Г — для следующих сессий):**
- **Фаза Б (1 сессия):** новое поле `requiredChain: ['key']` в `src/lib/vorTemplates.js`. Функция `expandChain()` в `src/lib/vorExcelGenerator.js` рядом с `getTemplate()` (253–276). Защита от рекурсии (visited Set, глубина 2) + дедуп (`[...new Set(...)]`) + `excludeFromSecondary` паттерн (160–188). POC на 1 паре (`pp_otsechi → fire_sealant` или `nvf_cladding_natural_stone → stone_sealant`). Снапшот-тесты не должны регрессить.
- **Фаза В (1 сессия):** `supabase/functions/vor-tech-advisor/index.ts`. Копировать паттерн из `vor-review/index.ts` (CORS 4–9, errorResult 197–215, extractJson 274–283, loadSimilarFeedback 232–254, OpenRouter call 342–359). Энциклопедия в **system message** (для prompt caching). Response: `{reasoning, additions: [{type, name, unit, reason}], confidence, tokens}`. Валидация: ≤5 additions, type только 'material'/'work'.
- **Фаза Г (1–2 сессии):** runner `vorTechAdvisorRunner.js` (паттерн `vorProposeRunner.js`). Третья кнопка в `VorAiPanel.jsx`. Компонент `VorTechAdditionsRow.jsx` (паттерн `VorAltRow.jsx`, оранжевая рамка). State в `VorFillModal.jsx`: `advising`, `advisingProgress`, `techAdditions Map`, `expandedTech Set`. Apply → `techAdditions` в `generateFilledVor` → постпроцесс-цикл. Поднять `max-lines` для VorFillModal.jsx 750→850.

**План в файле:** `C:\Users\Usrr\.claude\plans\streamed-napping-thacker.md` — детальный план со ссылками file:line, переиспользуемыми функциями, verification per phase.

**Auto-memory:** добавлен `project_tech_advisor.md` в `~/.claude/projects/c--Users-Usrr-Facade-HUB/memory/` + индекс MEMORY.md обновлён + `project_vor_engine.md` обновлён (старые энциклопедии помечены удалёнными).

**Handoff prompt:**
```
Продолжаем Facade_HUB. Фаза 6-А завершена коммитом 4d59836:
объединена и почищена фасадная энциклопедия — `src/data/encyclopediaFasad.md`
(596 строк, 14 разделов, без цен, Раздел 14 = 25 технологических цепочек).
Копия для Edge Function в supabase/functions/vor-tech-advisor/. Старые
ENCYCLOPEDIA_FASAD*.md в vor-engine/ удалены. Прочти memory и план в
`C:\Users\Usrr\.claude\plans\streamed-napping-thacker.md`. Сейчас на
очереди Фаза Б — добавить поле `requiredChain` в `src/lib/vorTemplates.js`
+ функцию `expandChain()` в `src/lib/vorExcelGenerator.js`. POC на одной
паре. Реши с пользователем какую пару взять (`pp_otsechi → fire_sealant`
или `nvf_cladding_natural_stone → stone_sealant`), потом проверь снапшоты.
```

---

## Session 2026-04-24 (Фаза 4: split-3 генератор — мембрана/крепёж в «Прочие материалы»)

**Контекст:** пользователь загрузил `Муза правильная версия 3.xlsx` — актуальный эталон. Сравнение показало структурное расхождение: у нас в material-позиции «Утеплитель толщ. 150 мм» (unit=м³) выводились и утеплитель (м³), и мембрана (м²); в auxiliary-позиции «Прочие материалы» — только `kind='вспомогат.'` (1 дюбель, имя дублировалось). В эталоне v3: в material — только утеплитель; в «Прочих» — мембрана + два разных дюбеля (все `kind='основн.'`).

**Done (Фаза 4):**
- `src/lib/vorExcelGenerator.js` split-3 путь:
  - добавлен трекинг `clusterMaterialUnits = Set<string>` per-cluster (unit-ы material-позиций кластера);
  - material-role фильтрует шаблонные материалы по `m.unit === pos.unit.toLowerCase()` — в позицию «Утеплитель толщ. X мм» идёт только сам утеплитель (мембрана с unit=м² автоматически исключается);
  - auxiliary-role теперь выводит **все** материалы шаблонов кластера с unit, отсутствующим в `clusterMaterialUnits` (независимо от `kind`), с дедупом по ключу `name|unit|j|k` (чтобы два дюбеля с одинаковым именем но разными j прошли оба);
  - `clusterMaterialUnits` и `clusterTemplates` сбрасываются на auxiliary-границе вместе.
- `eslint.config.js`: per-file override для `src/lib/vorExcelGenerator.js` — лимит `max-lines: 650` (с TODO вынести split-3 в отдельный модуль). Файл сейчас 606 эффективных строк.
- Все 6 снапшотов: **без изменений** (матчинг не трогали, только порядок и фильтрация материалов внутри split-3). Событие 6.2 / Сокольники / ВГК5 / ВГК5 Реновация / Адмирал — simple-режим, не затронуты.
- Build ок, eslint чисто.

**Verify:**
```
OUR clusters 1467–1475 (после фикса):
[1468] Утеплитель толщ. 150 мм → работа + 2 утеплителя (унит м³)  ✓ мембрана ушла
[1469] Прочие материалы → работа + мембрана + 2 дюбеля            ✓ мембрана+крепёж здесь
```

**Не чиним (специфика заказчика):**
- Толщина 150→180 мм (у Музы везде 180 несмотря на исходное описание) — решается через ручной override на портале.
- Имена материалов «Муза ТЕХНОВЕНТ СТАНДАРТ» / «EJOT H5 155/255» вместо наших дефолтов — ручная подстановка заказчика.
- Позиции 1482/1486 (у эталона мокрый фасад, у нас НВФ-утепление) — вопрос матчинга, не генератора; оставлено на следующий заход.

**Open:**
- `vorExcelGenerator.js` близок к лимиту — вынести split-3 в `vorSplit3Renderer.js` в отдельной итерации.
- Позиции 1482/1486 требуют правила: «если позиция упоминает мокрый фасад — уходить в wet_facade даже в контексте кластера НВФ».

**Handoff prompt:**
```
Продолжаем Facade_HUB. Фазы 1–4 ушли в main. Фаза 4: split-3 генератор теперь
корректно раскидывает утеплитель (в material-позицию) и мембрану+крепёж
(в «Прочие материалы») по unit — как в эталоне Муза правильная версия 3.
Все 6 снапшотов без регрессий. Осталось: (1) вынести split-3 из
vorExcelGenerator.js в отдельный файл; (2) поправить матчинг позиций
1482/1486 — у нас НВФ-утепление, у эталона мокрый фасад.
```

---

## Session 2026-04-24 (Фаза 3: шаблон створок + фикс дифференциации окон/дверей)

**Контекст:** пользователь добавил через портал custom-шаблон `custom_stvorka_spk` в `vor_custom_templates` ("Монтаж алюминиевых створок в составе витража", костпас «Профиль стойка-ригель», материал «Створка (по проекту)» j=1/k=1.1, keywords: створк*/одностворч*/двустворч*/поворот*/откидн*). В эталоне Событие 6.2 этот шаблон встречается в 107 строках (позиции 06.03.01.01.02.ХХ) — значит сам шаблон правильный, задача Фазы 3 = научить движок подмешивать его к основному составу окна/витража автоматически.

**Done (Фаза 3):**
- `src/lib/vorMatcher.js`: в `runRules` пост-обработка — если templates содержит `spk_profile` или `pvh_profile` и текст содержит `/створ|откидн|одностворч|двустворч|поворот/` → добавить `custom_stvorka_spk`. Реализация симметрична авто-pp_otsechi/flashings из Фазы 2.
- `src/lib/rules/vorRules.js`: новое узкое правило «окно/окном» ВЫШЕ общих дверей, чтобы «Окно одностворчатое» не перехватывалось дверьми через keyword `створч`. Regex `окно` точно НЕ ловит «оконных»/«оконный» (там «окон» без последней «о»), поэтому старое общее правило окон (`окна|оконн|аит`) осталось ниже как есть. Правила дверей не трогал.
- Существующий механизм `excludeFromSecondary` в `vorExcelGenerator.js` автоматически дедуплицирует: если в ВОР есть отдельная позиция на профиль/леса/КМД (как в Событии 6.2), то в позициях окон со створками они не дублируются → остаётся `custom_stvorka_spk + spk_glass`. На других ВОР (где таких отдельных позиций нет) — полный комплект.
- Снапшоты пересохранены (6/6): Событие 6.2 (+84 — добавление створки к окнам+створкам), Муза (+9 — 3 позиции с «оконных блоков; Дверь Створка»), ВГК5 (+21 — «одностворчатая витражная» из раздела «Фасадные двери»), Адмирал (+3 — ПВХ окна со створками в noteCustomer). Сокольники и ВГК5 Реновация — без изменений.
- `npm run build` ок; eslint на vorRules.js и vorMatcher.js — чисто.

**Key discoveries во время отладки:**
- Правило общих дверей содержало keyword `створч` — ловило «одностворчатое» в окнах ошибочно. Убирать нельзя: в ВГК5 позиции раздела «Фасадные двери» названы «Одностворчатая витражная» (без слов «окно»/«дверь») и `створч` — единственное, что их различает как двери.
- Решение: regex `окно` (4 буквы подряд) matches «окно»/«окном», но НЕ matches «оконных»/«оконный» (там «окон» без финальной «о»). Даёт чистое разделение без контекста раздела.
- В Адмирал 7.10.3.1 и Муза 1494/1539 створки реально упоминаются в noteCustomer — авто-добавление там корректно.

**Decisions:**
- `custom_stvorka_spk` оставляем в Supabase (не переносим в кодовые vorTemplates.js) — пусть пользователь может менять его через портал.
- Хардкод имени `custom_stvorka_spk` в vorMatcher.js — прагматично. Если нужно расширять на другие custom-шаблоны — тогда общий механизм «append_to» в таблице, но это overkill на один шаблон.
- «поворот» включён в regex — ловит «поворотно-откидной створкой» как полный признак.

**Open:**
- Валидация Фазы 2+3: прогнать Событие 6.2 на портале через Gemini-ревью, сверить сколько 🔴 осталось (ожидаемо резко меньше, чем до Фаз 1–3).
- Калибровка шкалы score Gemini (Flash завышает) — Фаза 4 в очереди.
- Окна с разделением на створку и заполнение с точными объёмами — сейчас j=1/k=1.1 плейсхолдеры, пользователь правит в Excel вручную. Если в будущем нужны точные нормативы — отдельный заход.

**Handoff prompt:**
```
Продолжаем Facade_HUB. Фазы 1–3 завершены: 19 правил в промпт Gemini (Фаза 1),
6 правил в движок (Фаза 2), custom_stvorka_spk авто-подмешивание + фикс
дифференциации окно/дверь (Фаза 3). Все снапшоты актуальны. Осталось:
(1) валидация через Gemini-ревью на обновлённом выводе Событие 6.2,
(2) калибровка шкалы score Gemini если результаты покажут завышения.
Детали в memory.md Session 2026-04-24 (все 3 фазы).
```

---

## Session 2026-04-24 (Фаза 2: перенос правил AI-ревьюера в движок)

**Контекст:**
В прошлой сессии (Фаза 1) добавили 19 правил в промпт Gemini-ревьюера (`supabase/functions/vor-review/index.ts`) из накопленного 👍/👎-фидбека по Событию 6.2. Gemini стал корректно комментировать, но ошибки движка оставались теми же — на каждом прогоне одни и те же 🔴. Фаза 2 закрывает источник: переносим правила в сам движок, чтобы подбор был правильным с первого раза.

**Done (Фаза 2):**
- `src/lib/rules/vorRules.js`: +3 новых правила (раздвижные двери → skip; металлические ограждения парапета → skip; стемалит как облицовка НВФ → `spk_profile+insulation+spk_glass+kmd_nvf` гибрид), 2 переписаны (корзины/ниши А/С → `wet_facade+nvf_subsystem+nvf_cladding_cassette+scaffolding+kmd_nvf`; фасадные вентрешётки → 2 правила: с утеплителем `spk_profile+vent_grilles+insulation+scaffolding` и без `spk_profile+vent_grilles+scaffolding`).
- Бонус-фикс: `решетк` → `реш[её]т` в keywords (иначе не ловило «решётки»); `вентрешетк` → `вентреш` (чтобы ловило «вентрешеток»/«вентрешётки»); «решётки под лоджиями» перенесено ВЫШЕ «корзин А/С» — иначе «решётки над нишами кондиционеров» уходили в гибрид wet+НВФ.
- `src/lib/vorMatcher.js`: в `runRules` добавлено авто-пост-добавление `pp_otsechi` (если текст содержит «откос») и `flashings` (если «отлив») — срабатывает только если основное правило уже дало хотя бы один `nvf_cladding_*`.
- Снапшоты пересохранены (6/6): Муза, Сокольники, ВГК5, ВГК5 Реновация — без изменений; Событие 6.2 — 51 намеренное изменение; Адмирал — 12 намеренных (pp_otsechi/flashings подмешаны к НВФ-позициям с «откос»/«отлив» в описании + корзины А/С → гибрид).
- `npm run build` ок; eslint на vorRules.js и vorMatcher.js — чисто.

**Decisions:**
- Аквапанели — отложены до первого реального ВОР с такой позицией (нет шаблона и нет фидбека).
- Стемалит-облицовка НВФ реализован ГИБРИДОМ spk_profile+insulation+spk_glass+kmd_nvf (БЕЗ nvf_subsystem) — как в фидбеке пользователя. Отдельный шаблон `nvf_cladding_stemalit` не создаём.
- Корзины А/С — гибрид wet_facade+НВФ кассета+kmd_nvf. Мокрый для оштукатуривания внутренних откосов ниши, кассета на лицевой плоскости.
- Авто-добавление pp_otsechi/flashings для НВФ сделано в `vorMatcher.js` (не через новое поле правила), т.к. случай частный.

**Open:**
- Ручная проверка на портале: загрузить Событие 6.2 через «Заполнение ВОРа», сверить чипы матчинга.
- Повторный Gemini-ревью Событие 6.2 — должно заметно упасть число 🔴.
- Калибровка score Gemini (Flash завышает на 2–3 замечаниях) — Фаза 3, чистый prompt-tuning.
- Окна со створками/заполнениями (~11 ошибок из 29 на окнах) — отдельный заход.

**Handoff prompt:**
```
Продолжаем Facade_HUB. В прошлой сессии (Фаза 2) перенесли 6 правил из промпта Gemini в движок
(src/lib/rules/vorRules.js + src/lib/vorMatcher.js). Все снапшоты обновлены, build ок.
Осталось: (1) прогнать Событие 6.2 через портал и сверить чипы матчинга; (2) перезапустить
Gemini-ревью на Событие 6.2 и сверить дельту 🔴; (3) Фаза 3 — калибровка шкалы score
и работа с окнами/створками. Подробности в memory.md Session 2026-04-24.
```

---

## Session 2026-04-22
**Done:**
- VOR engine: pvh_profile, внутренние двери→тамбур, декоратив skipInsulation, filterExcluded с сохранением утеплителя, козырёк выше стоечно-ригельн, корзины кондиционеров, стилобат, перильн с свтпрозр → glass_railing, штукатур fallback → полный wet_facade, wet_facade family clustering для split-3
- pp_otsechi: новый шаблон П/П отсечек идентичен flashings, добавляется к откосам (не к отливам/парапетам), noteGp "Откосы" / "П/П отсечки"
- Портал: превью матчинга в VorFillModal с чипами шаблонов, tooltip с сработавшим правилом, кнопка ✏ для override per-position, вкладка "База шаблонов" с 36 код-шаблонами (read-only) + пользовательские шаблоны из Supabase (fallback после кодовых)
- Снапшот-тесты (test_snapshots.mjs + snapshots/*.json) для 6 ВОР — ловят регрессии матчинга
- Рефакторинг: matchPositionDetailed, family clustering wet_facade_*, tplWorks/tplMaterials хелперы, убрали дубли works+materials, vorMatcher.js разбит на vorTemplates/vorRules/vorMatcher
- Инфраструктура: code splitting (bundle 2040→601 KB), ErrorBoundary с fallback UI, удалён legacy vor_templates (API + таблица), API-слой для Contractors/Prompts/Questions/storage.uploadImage, SWR для кэша на 3 страницах
- История ВОР: vor_history table + Storage upload, список с download/delete на VorPage и на ObjectPage

**Key architectural decisions:**
- Код-шаблоны в src/lib/vorTemplates.js — источник истины (36 шт., не редактируется на портале)
- Custom-шаблоны в Supabase vor_custom_templates — fallback, редактируются через VorCustomTemplateEditor
- Матчинг: runRules запускается на MATCH_RULES, потом на customRules — первое совпадение побеждает
- Генератор принимает { customTemplates, customRules, overrides } и мержит в ALL_TEMPLATES

**Supabase migrations applied by user:**
- 021_vor_engine_templates.sql → vor_custom_templates
- 022_drop_legacy_vor_templates.sql → дропнута vor_templates
- 023_vor_history.sql → vor_history

**Open (next session):**
- AI-агент для движка ВОР. Пользователь хочет: (1) помощь при проверке матчинга, (2) возможность внесения изменений через диалог, (3) расценка сложных нестандартных позиций.
- Предложенные варианты внедрения (см. переписку):
  1. Fallback-матчер (AI дорасценивает что не поймали правила)
  2. Ревьюер после матчинга (AI-комментарии к каждой позиции в превью)
  3. Расценщик сложных позиций (чат → список работ/материалов → override/custom-шаблон)
  4. Диалог "что не так с выбранной позицией"
- Ключевые решения: client-side vs Edge Function, модель (Haiku vs Sonnet), prompt caching для каталога шаблонов, с какой функции начать (предложил №2 как MVP).

**Handoff prompt for next session:**
"Продолжаем работу над Facade_HUB. В предыдущей сессии завершили: VOR-движок с custom-шаблонами в Supabase, портальная страница базы шаблонов (36 код + N пользовательских), snapshot-тесты, история ВОР, code splitting/ErrorBoundary/SWR/API-слой. Теперь хотим добавить AI-агент для расценки ВОРа через Claude API — обсуждали 4 варианта встраивания (fallback-матчер, ревьюер, расценщик сложных, диалог 'что не так'). Нужно выбрать архитектуру (client-side vs Edge Function), модель (Haiku/Sonnet), порядок реализации. Склонялись к варианту №2 (ревьюер) как MVP. Начнём с уточнения вопросов."

---

## Session 2026-04-21 (continued)
**Done:**
- Committed pvh_profile template, внутренние двери→тамбур, декоратив skipInsulation, filterExcluded fix (from prior session)
- Pushed all changes to main branch and portal (GitHub)
- VGK5 Реновация 5-cycle analysis complete:
  - Cycle 1: pvh_profile, внутренние двери, декоратив, filterExcluded (prior session)
  - Cycle 2: козырёк "в составе витражной стоечно-ригельной системы" → matched spk_profile (bug). Fixed by moving козырёк rule above стоечно-ригельн in MATCH_RULES
  - Cycle 3: All other positions verified correct. thickness=150 for 10.3.1.1 was correct (cell says 150мм, not 170мм)
  - Cycles 4-5: No remaining bugs. VGK5 Реновация output: 19/19 matched, 0 unmatched, 183 rows
- Committed and pushed: козырёк rule moved above стоечно-ригельн (no regression on Событие steel canopies)

**Decisions:**
- козырёк rule now placed ABOVE стоечно-ригельн (but only glass_canopy for all козырёк, including steel — same as pre-fix behavior where козыр was above профил/каркас)
- Steel canopies in Событие 6.2 were already routing to glass_canopy before the fix — no change in behavior

**Current stats:**
- Событие 6.2: 231/240 matched, 2407 rows
- Муза: 70/70 matched, 478 rows
- Сокольники: 93/139 matched (approx), 602 rows
- ВГК5 реновация: 19/19 matched, 183 rows

**Open:**
- README.md may need updating with козырёк rule placement note
- ВГК5 (not реновация) also runs cleanly at 21/21 matched

**Handoff prompt:**
"Продолжаем работу над VOR-движком (src/lib/vorMatcher.js + vorExcelGenerator.js). Последние изменения: (1) pvh_profile шаблон для ПВХ окон, (2) внутренние двери → тамбур, (3) декоратив skipInsulation, (4) filterExcluded с сохранением утеплителя при 'утеплен' в названии, (5) козырёк правило выше стоечно-ригельн. ВГК5 Реновация протестирован в 5 циклов — все 19 позиций matched. Что делаем дальше?"

---

## Session 2026-04-21
**Done:**
- Applied all 13 structural fixes from previous session to vorMatcher.js and vorExcelGenerator.js
- Added wet_facade template (ROCKforce/ROCKglue/ROCKmortar/ROCKprimer/ROCKsil with j/k)
- Insulation for wet_facade now injected INLINE after ROCKglue in generator (not as secondary template)
- Updated flashings: added герметик section (СТИЗ-А + СТИЗ-В), fixed Дюбель-гвоздь j=4 k=2, full names
- Updated glass_railing: two EPDM uplotniteli (базовый + установочный) + анкерный крепёж Ø14х110
- Added nvf_cladding_profiles_vertical template
- Updated insulation: outer always 50mm (j=0.05), fire membrane always present, same name both layers
- Added detectInsulationLayers() for "X+Y мм" pattern
- Updated MATCH_RULES: skip перголы/пол в лоджиях, wet_facade before штукатур, откосы/пилоны/короба/решетки correctly routed
- Generated test_output_sobytie.xlsx — 231/240 positions matched, 2407 rows
- Committed and pushed to main (d6576b1, fd6d325)

**Decisions:**
- Двери в составе витража — NOT fixed; varies per tender, user fixes manually
- 223 diff positions remain but 36 are name-only (unavoidable), rest are pricing rows ("Работа Алден") or project-specific door simplifications
- wet_facade insulation inline approach: inject m3 rows after ROCKglue in getTemplate(), not via secondary

**Open:**
- Portal auto-deploys from GitHub main — no manual deploy needed
- kmd_nvf still added as secondary for НВФ — causes +1 row in some positions vs reference

**Handoff prompt:**
"Продолжаем VOR движок (Facade_HUB). Все 13 исправлений Событие 6.2 применены и запушены. Шаблоны: wet_facade (ROCKforce система), flashings (герметик), glass_railing (2 EPDM + анкер), profiles_vertical — все в vorMatcher.js. Утеплитель НВФ: outer=50mm, мембрана всегда. Для мокрого фасада утеплитель вставляется inline в генераторе (vorExcelGenerator.js getTemplate). Оставшиеся расхождения с правильным файлом — именные (неизбежны) и двери в составе витража (пользователь правит вручную)."

---

## Session 2026-04-20 (4)

**Done:**
- Портал: кнопка "Заполнение ВОРа" на VorPage + модалка `VorFillModal` (загрузка пустого ВОР + прайса, флаг Донстрой, статистика)
- Миграция `020_vor_work_prices.sql` — таблица цен работ на объект
- API `src/api/vorPrices.js` — fetch/save/count/delete + `entriesToPriceMap`
- `src/lib/vorPriceLoader.js` — парсер Excel прайса + `findWorkPrice` с 4-ступенчатым лукапом (exact tplKey+name, single-entry, prefix first-word, fallback costPath+name)
- В `generateFilledVor` опция `workPrices` — заполняет столбец P для work-строк
- Замена имени основного материала облицовки НВФ на описание заказчика (name > note fallback), k из шаблона
- 13 cladding шаблонов с каноническими k (клинкер/кассеты/керамогранит/керамика/камень/АКП/фибробетон 1.22; бетонная плитка/утеплитель 1.15; оцинкованный лист 1.20; кирпич/ФЦП 1.05; арх.бетон 1.00; подсистема 1.12)
- Флаг `priceAllWithQty` в `isHeader` — для Донстрой (Событие, Символы) расцениваем родителей и детей; для остальных (Муза, Сокольники) композитный родитель = заголовок
- `generate_prices_template.mjs` — генератор базового шаблона прайса (31 уникальная работа)
- Коммиты: e52dc10, f79eedd, 69ca6d8, 2095cf9

**Decisions:**
- Модалка per-object, прайс сохраняется в БД (vor_work_prices), заменяется при загрузке нового
- Фурнитура: только standalone по keyword (убрана из secondary СПК правил)
- "без утеплителя" в тексте → исключить insulation template
- Порядок правил: специфичные нвф облицовки ДО `стекл`, wet_facade ДО `утеплен`, ФЦП ДО фибробетона, окна/двери ДО `профил`/`стоечно-ригельн`

**Open — критичное:**
- **Баг в браузере:** "Module stream has been externalized... Cannot access stream.Readable in client code" — после открытия модалки или при взаимодействии. Причина не локализована. Возможно в vorPriceLoader.js / vorPrices.js / VorFillModal.jsx
- **Модалка не открывается по клику** — возможно связано со stream ошибкой (JS крашится)
- **Миграция `020_vor_work_prices.sql` не применена** — ждёт выполнения в Supabase
- **Не закоммичено:** переименование заголовка VorPage "Заполнение ВОРа" → "ВОР объекта"

**Handoff prompt:**
Продолжаем работу над VOR порталом. Прочитай memory. В прошлой сессии запушен commit 2095cf9 с модалкой VorFillModal, но обнаружен баг в браузере: "Module stream has been externalized... Cannot access stream.Readable in client code". Модалка не открывается. Задачи: 1) Найти источник stream-ошибки в новых файлах (vorPriceLoader.js, vorPrices.js, VorFillModal.jsx); 2) Исправить на браузерно-совместимый API; 3) Проверить что модалка открывается по кнопке "Заполнение ВОРа"; 4) Применить миграцию supabase/020_vor_work_prices.sql через Supabase MCP. Запусти dev-сервер и cloudflare tunnel для тестирования.

---

## Session 2026-04-17 (3)
**Done:** 8 новых cladding шаблонов с k из канонической таблицы, правила матчинга для каждого, флаг priceAllWithQty, замена имени облицовки на заказчика

**Handoff:** Создать прайс работ per-object, реализовать загрузку и применение

---

## Session 2026-04-17 (2)
**Done:** Событие 6.2 поддержка (композитные родители, стемалит/АИТ, пеностекло/ЭППС, фильтр "без утепления", фибробетон), исправления порядка правил, isHeader по qty

**Handoff:** Интегрировать прайс работ в портал

---

## Session 2026-04-16 (3)
**Done:** НВФ полный цикл (+ insulation), generic НВФ rule, КМД как отдельная позиция + excludeFromSecondary, фурнитура (изначально как secondary)

---

## Session 2026-04-16 (2)
**Done:** Автодетекция толщины утеплителя с универсальной формулой (150/180/100 + любая толщина в 30-300мм), гибридный split-3, classifyRowRole + "отделка", detectInsulationType для пеностекло/ЭППС

---

## Session 2026-04-22 (вечер)

**Done:**
- Обсуждён AI-ревьюер ВОРа на Gemini 2.5 Flash (вариант №2 — пост-матчинговый ревьюер через Supabase Edge Function, кнопка в VorFillModal, узкий режим: только tplKey/costPath/noteCustomer). **Ждём API-ключ Gemini от пользователя.**
- Поднят временный туннель cloudflared к localhost:5173 (закрыт в конце сессии).
- Добавлены новые правила v5 в auto-memory: откосы из облицовки без утеплителя + отсечки; толщина утеплителя из контекста «утепл*»; декор. профиль ≠ СПК; решётки = полный НВФ.
- 4 code-фикса в движке ВОР по результатам анализа Событие 6.2:
  1. `src/lib/vorMatcher.js` — `detectInsulationThickness` теперь требует слово «утепл/теплоизол/изоляц/минват/каменн.ват/базальт» в ~30 символах до числа (иначе undefined). Чинит `.03` с 70→180мм.
  2. `src/lib/rules/vorRules.js` + `vorMatcher.js` + `vorExcelGenerator.js` — новое поле `defaultThickness` в правилах, генератор использует его как фоллбэк перед хардкод-150. Применено к правилу решёток (`.15.04`: 150→180мм).
  3. `src/lib/rules/vorRules.js` строки 53 и 57 — убран `flashings` из правил откосов (шаблон идентичен `pp_otsechi`, был дубликат оцинковка+герметик в `.16.01-.09`).
  4. Перенос `src/lib/vorRules.js` → `src/lib/rules/vorRules.js` (git mv). Импорт обновлён в `vorMatcher.js`.
- Снепшоты обновлены: `sobytie.json`, `admiral.json` (из-за удаления `flashings`). Остальные 4 объекта без изменений.
- Все тесты проходят, `npm run build` ок.

**Decisions:**
- AI-ревьюер: Gemini 2.5 Flash (не Claude — нет кредитов), Edge Function прокси, НЕ client-side (ключ не светим в браузер), кнопка вместо автозапуска, узкий режим на старте.
- Из 13 расхождений Событие 6.2 фиксили только 5, 9, 10, 11. Остальные — «специфика объекта» (имена подсистем, «Работа Алден», фахверк, полный состав мокрого, КМ/КМД) не трогаем.
- Леса + КМД оставляем в конце вывода (не переупорядочиваем).
- Правила вынесены в `src/lib/rules/` без разделения по темам (пока один файл).

**Open:**
- Ждём от пользователя API-ключ Gemini → после него: поднять Edge Function `vor-review`, ручной curl-тест, кнопка в VorFillModal.
- Пользователь скоро пришлёт ВОР Событие 6.1 (идентичной структуры с 6.2) — прогнать через движок, сверить, закрыть оставшиеся точечные баги если будут.
- Потенциально — имя материала для `.15.03` в эталоне 6.2 выглядит как опечатка заказчика (склейка с соседней позицией). Наш вывод чище. Если в 6.1 будет то же — не смущаться.

**Handoff prompt:**
```
Продолжаем Facade_HUB. В прошлой сессии завершили фиксы по Событие 6.2:
рельеф, дубликаты откосов, defaultThickness-механизм, перенос правил в
src/lib/rules/. Снепшоты sobytie+admiral обновлены, все тесты проходят,
коммит запушен в main.

Теперь ждём ВОР Событие 6.1 — идентичный по структуре с 6.2. План:
1. Положить файл в корень проекта как `Событие 6.1 тест.xlsx` (+ правильный
   вариант как `Событие 6.1 правильное.xlsx`).
2. Создать `test_sobytie_6_1.mjs` по паттерну `test_sobytie.mjs`.
3. Прогнать, свериться с эталоном.
4. Закрыть точечные баги если всплывут.

Плюс на очереди — AI-ревьюер через Gemini 2.5 Flash. Пользователь получает
ключ отдельно, без него работа не начинается. Детали в
`~/.claude/projects/c--Users-Usrr-Facade-HUB/memory/project_ai_reviewer.md`.

Прочти memory.md и начни с уточняющих вопросов.
```

---

## Session 2026-04-16
**Done:** split-3 режим (Муза), переупорядочение MATCH_RULES, JS↔Python синхронизация
