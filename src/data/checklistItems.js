/**
 * Статусы элементов чек-листа
 */
export const CHECKLIST_STATUS = {
  ACCOUNTED: 'ACCOUNTED',                     // Учтено
  NOT_ACCOUNTED: 'NOT_ACCOUNTED',             // Не учтено
  MISSING_NOT_ACCOUNTED: 'MISSING_NOT_ACCOUNTED', // Отсутствует, не учтено
  MISSING_BUT_ACCOUNTED: 'MISSING_BUT_ACCOUNTED', // Отсутствует, но учтено
  INSUFFICIENT_INFO: 'INSUFFICIENT_INFO'      // Недостаточно информации
};

/**
 * Конфигурация статусов с цветами и названиями
 */
export const STATUS_CONFIG = {
  [CHECKLIST_STATUS.ACCOUNTED]: {
    label: 'Учтено',
    color: '#22c55e',
    bgColor: '#dcfce7'
  },
  [CHECKLIST_STATUS.NOT_ACCOUNTED]: {
    label: 'Не учтено',
    color: '#ef4444',
    bgColor: '#fee2e2'
  },
  [CHECKLIST_STATUS.MISSING_NOT_ACCOUNTED]: {
    label: 'Отсутствует в проекте',
    color: '#f97316',
    bgColor: '#ffedd5'
  },
  [CHECKLIST_STATUS.MISSING_BUT_ACCOUNTED]: {
    label: 'Отсутствует, но учтено',
    color: '#8b5cf6',
    bgColor: '#ede9fe'
  },
  [CHECKLIST_STATUS.INSUFFICIENT_INFO]: {
    label: 'Недостаточно информации',
    color: '#eab308',
    bgColor: '#fef9c3'
  }
};

/**
 * Маппинг русских названий статусов на enum значения
 */
export const STATUS_ALIASES = {
  'учтено': CHECKLIST_STATUS.ACCOUNTED,
  'да': CHECKLIST_STATUS.ACCOUNTED,
  '+': CHECKLIST_STATUS.ACCOUNTED,
  'не учтено': CHECKLIST_STATUS.NOT_ACCOUNTED,
  'нет': CHECKLIST_STATUS.NOT_ACCOUNTED,
  '-': CHECKLIST_STATUS.NOT_ACCOUNTED,
  'отсутствует': CHECKLIST_STATUS.MISSING_NOT_ACCOUNTED,
  'отсутствует в проекте': CHECKLIST_STATUS.MISSING_NOT_ACCOUNTED,
  'н/п': CHECKLIST_STATUS.MISSING_NOT_ACCOUNTED,
  'отсутствует но учтено': CHECKLIST_STATUS.MISSING_BUT_ACCOUNTED,
  'отс. учтено': CHECKLIST_STATUS.MISSING_BUT_ACCOUNTED,
  'недостаточно информации': CHECKLIST_STATUS.INSUFFICIENT_INFO,
  'н/и': CHECKLIST_STATUS.INSUFFICIENT_INFO,
  '?': CHECKLIST_STATUS.INSUFFICIENT_INFO
};

/**
 * Дефолтный список элементов фасада (27 пунктов)
 */
export const DEFAULT_CHECKLIST_ITEMS = [
  { id: 1, name: 'МОКАП. Указать в примечании площадь', hint: 'Укажите площадь в м²' },
  { id: 2, name: 'Подшивки входных групп / арок / консольных участков', hint: null },
  { id: 3, name: 'СОФ. В примечании - тип', hint: 'Укажите тип СОФ' },
  { id: 4, name: 'Мокрый фасад: тамбуры, надстройки, обратная сторона парапета, тех.балконы, лоджии, тех. ниши', hint: null },
  { id: 5, name: 'Подсистема', hint: null },
  { id: 6, name: 'Облицовка', hint: null },
  { id: 7, name: 'Витражное остекление из алюминиевого профиля. Стилобат', hint: null },
  { id: 8, name: 'Витражное остекление из алюминиевого профиля. Высотная часть', hint: null },
  { id: 9, name: 'ПВХ-окна', hint: null },
  { id: 10, name: 'Лоджии и внутренний оконно-дверной блок ПВХ (вторая нитка остекления)', hint: null },
  { id: 11, name: 'Моллированные стеклопакеты', hint: null },
  { id: 12, name: 'Крупноформатные стеклопакеты (>5м²)', hint: null },
  { id: 13, name: 'Вид утеплителя (Роквул, ТН, Изовол)', hint: 'Укажите производителя' },
  { id: 14, name: 'Защита СПК поликарбонатом на каркасе (мат.комп.)', hint: null },
  { id: 15, name: 'Оклейка СПК бронирующей пленкой', hint: null },
  { id: 16, name: 'Козырьки', hint: null },
  { id: 17, name: 'Шумозащитный / декоративный экран / перголы', hint: null },
  { id: 18, name: 'Маркизы', hint: null },
  { id: 19, name: 'Вентиляционные решетки', hint: null },
  { id: 20, name: 'Зенитные фонари', hint: null },
  { id: 21, name: 'Лабораторные испытания СПК/НВФ', hint: null },
  { id: 22, name: 'Французские балконы', hint: null },
  { id: 23, name: 'Стеклянные ограждения прямые (парапет, кровля и т.д.)', hint: null },
  { id: 24, name: 'Стеклянные ограждения моллированные', hint: null },
  { id: 25, name: 'Наружные витражные двери', hint: null },
  { id: 26, name: 'Тамбурные перегородки и двери', hint: null },
  { id: 27, name: 'ПП-отсечки и отливы', hint: 'Важный элемент!' }
];

/**
 * Создаёт начальное состояние чек-листа для объекта
 */
export function createInitialChecklist(objectId) {
  return DEFAULT_CHECKLIST_ITEMS.map(item => ({
    ...item,
    objectId,
    status: null,
    note: '',
    customValue: ''
  }));
}
