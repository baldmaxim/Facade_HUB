// Строка «Альтернативный подбор Gemini» — раскрывается под позицией,
// показывает сравнение движок vs Gemini и предлагает кнопки Заменить/Дополнить.
import { SECONDARY, tplLabel } from '../lib/vorTplNames';

export default function VorAltRow({ row, proposal, expanded, onReplace, onMerge, onCancel }) {
  if (!proposal || !proposal.tplKeys || proposal.tplKeys.length === 0) return null;
  if (!expanded) return null;
  return (
    <tr className="vfm-alt-row">
      <td></td>
      <td colSpan={2} className="vfm-alt-cell">
        <div className="vfm-alt-head">
          <span className="vfm-alt-label">🤖 Альтернативный подбор Gemini ({proposal.score}/100)</span>
        </div>
        <div className="vfm-alt-compare">
          <div className="vfm-alt-line">
            <span className="vfm-alt-lbl">Сейчас:</span>
            {row.templates.map(t => (
              <span key={t} className={`vfm-chip ${SECONDARY.has(t) ? 'vfm-chip-sec' : 'vfm-chip-main'}`}>{tplLabel(t)}</span>
            ))}
          </div>
          <div className="vfm-alt-line">
            <span className="vfm-alt-lbl">Предлагает:</span>
            {proposal.tplKeys.map(t => (
              <span key={t} className={`vfm-chip vfm-chip-propose ${SECONDARY.has(t) ? 'vfm-chip-sec' : ''}`}>{tplLabel(t)}</span>
            ))}
          </div>
        </div>
        {proposal.reasoning && (
          <div className="vfm-alt-reason">{proposal.reasoning}</div>
        )}
        {proposal.comment && (
          <div className="vfm-alt-comment"><b>Вывод:</b> {proposal.comment}</div>
        )}
        <div className="vfm-alt-actions">
          <button type="button" className="vfm-btn-alt-replace" onClick={onReplace}>🔄 Заменить</button>
          <button type="button" className="vfm-btn-alt-merge" onClick={onMerge}>➕ Дополнить</button>
          <button type="button" className="vfm-btn-secondary" onClick={onCancel}>Отмена</button>
        </div>
      </td>
    </tr>
  );
}
