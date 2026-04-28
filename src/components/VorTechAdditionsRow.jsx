// Строка «Технологические дополнения Gemini» — раскрывается под позицией,
// показывает упущенные по технологии материалы/работы. Каждая addition имеет
// кнопку «Дополнить шаблон»; нажатие добавляет её в Excel-генератор и
// перерасчитывает dry-run. Применённые помечаются зелёным с кнопкой «Отменить».
// Стили — в VorFillModal.css (классы vfm-tech-*, оранжевая рамка для не-applied,
// зелёная подсветка для applied).

export default function VorTechAdditionsRow({ entry, expanded, appliedSet, onToggleApply, onCancel }) {
  if (!entry) return null;
  if (!expanded) return null;
  const { additions = [], confidence = 0, reasoning = '', comment = '' } = entry;
  const isError = comment && /^(Ошибка|Сбой)/i.test(comment);
  const appliedCount = additions.filter(a => appliedSet && appliedSet.has(a)).length;

  return (
    <tr className="vfm-tech-row">
      <td></td>
      <td colSpan={2} className="vfm-tech-cell">
        <div className="vfm-tech-head">
          <span className="vfm-tech-label">
            🔧 Технологические дополнения Gemini ({confidence}/100)
            {appliedCount > 0 && (
              <span className="vfm-tech-applied-count"> · применено {appliedCount} из {additions.length}</span>
            )}
          </span>
        </div>
        {reasoning && <div className="vfm-tech-reason">{reasoning}</div>}
        {isError && <div className="vfm-tech-error"><b>Ошибка:</b> {comment}</div>}
        {!isError && additions.length === 0 && (
          <div className="vfm-tech-empty">Упущений не найдено — всё что нужно по технологии уже заведено.</div>
        )}
        {additions.length > 0 && (
          <ul className="vfm-tech-list">
            {additions.map((a, i) => {
              const isApplied = appliedSet && appliedSet.has(a);
              return (
                <li key={i} className={`vfm-tech-item vfm-tech-item-${a.type}${isApplied ? ' vfm-tech-item-applied' : ''}`}>
                  <div className="vfm-tech-item-head">
                    <span className={`vfm-tech-type vfm-tech-type-${a.type}`}>
                      {a.type === 'work' ? 'работа' : 'материал'}
                    </span>
                    <span className="vfm-tech-name">{a.name}</span>
                    <span className="vfm-tech-unit">{a.unit}</span>
                    {typeof a.qtyPerUnit === 'number' && a.qtyPerUnit > 0 && (
                      <span className="vfm-tech-qty" title="Норма расхода на единицу объёма позиции">
                        × {a.qtyPerUnit}
                      </span>
                    )}
                    {isApplied ? (
                      <button
                        type="button"
                        className="vfm-tech-btn vfm-tech-btn-applied"
                        onClick={() => onToggleApply(a)}
                        title="Откатить — убрать строку из Excel"
                      >
                        ✓ Отменить
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="vfm-tech-btn"
                        onClick={() => onToggleApply(a)}
                        title="Добавить как отдельную строку в Excel (после штатных строк позиции)"
                      >
                        ➕ Дополнить шаблон
                      </button>
                    )}
                  </div>
                  {a.reason && <div className="vfm-tech-reason-item">{a.reason}</div>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="vfm-tech-actions">
          <button type="button" className="vfm-btn-secondary" onClick={onCancel}>Скрыть</button>
        </div>
      </td>
    </tr>
  );
}
