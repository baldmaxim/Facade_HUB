# Project Memory

_Maintained at the end of each session. Contains decisions, results, open questions._

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
