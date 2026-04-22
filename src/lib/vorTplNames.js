// Имена шаблонов ВОР для UI (человекочитаемые ярлыки).
// SECONDARY — вспомогательные шаблоны, которые рендерятся бледнее (леса, КМД).

export const TPL_NAMES = {
  spk_profile:                  'Профиль стойка-ригель',
  spk_glass:                    'Стеклопакет',
  spk_broneplenka:              'Бронеплёнка',
  pvh_profile:                  'Профиль ПВХ',
  nvf_subsystem:                'Подсистема НВФ',
  insulation:                   'Утеплитель',
  nvf_cladding_clinker:         'Клинкер',
  nvf_cladding_cassette:        'Кассеты',
  nvf_cladding_concrete_tile:   'Бетонная плитка',
  nvf_cladding_fibrobeton:      'Фибробетон',
  nvf_cladding_ceramic:         'Керамика',
  nvf_cladding_porcelain:       'Керамогранит',
  nvf_cladding_natural_stone:   'Натур. камень',
  nvf_cladding_akp:             'АКП',
  nvf_cladding_fcp:             'ФЦП',
  nvf_cladding_galvanized:      'Оцинков. лист',
  nvf_cladding_arch_concrete:   'Арх. бетон',
  nvf_cladding_brick:           'Кирпич',
  nvf_cladding_profiles_vertical: 'Верт. профили',
  wet_facade:                   'Мокрый фасад',
  wet_facade_insulation:        'Мокрый (утеплитель)',
  wet_facade_finish:            'Штукатурный слой',
  wet_facade_paint:             'Окраска',
  flashings:                    'Откосы/отливы',
  pp_otsechi:                   'П/П отсечки',
  glass_railing:                'Стекл. ограждения',
  glass_railing_molled:         'Молл. ограждения',
  glass_canopy:                 'Козырёк (триплекс)',
  vent_grilles:                 'Вентрешётки',
  scaffolding:                  'Леса',
  kmd_spk:                      'КМД СПК',
  kmd_nvf:                      'КМД НВФ',
  doors_entrance:               'Двери входные',
  doors_tambour:                'Тамбурные двери',
  mockup:                       'Мокап',
};

export const SECONDARY = new Set(['scaffolding', 'kmd_spk', 'kmd_nvf']);

export function tplLabel(key) {
  return TPL_NAMES[key] || key;
}
