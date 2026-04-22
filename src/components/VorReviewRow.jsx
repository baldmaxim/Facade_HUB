// Раскрывающаяся строка под позицией: разбор Gemini + кнопки 👍/👎 + форма коррекции.
// Рендерится как <tr>, поэтому возвращает null если нет reasoning или не раскрыта.
import { TPL_NAMES, SECONDARY, tplLabel } from '../lib/vorTplNames';

export default function VorReviewRow({
  review, expanded,
  feedbackStatus, feedbackForm,
  onFormChange,
  onSubmitCorrect, onOpenIncorrect, onSubmitIncorrect,
}) {
  if (!review || !review.reasoning) return null;
  if (!expanded) return null;
  return (
    <tr className={`vfm-reasoning-row vfm-reasoning-${review.verdict}`}>
      <td></td>
      <td colSpan={2} className="vfm-reasoning-cell">
        <div className="vfm-reasoning-head">
          <span className="vfm-reasoning-label">🔍 Разбор Gemini (оценка подбора: {review.score}/100):</span>
        </div>
        <div className="vfm-reasoning-text">{review.reasoning}</div>
        {review.comment && (
          <div className="vfm-reasoning-comment"><b>Вывод:</b> {review.comment}</div>
        )}
        <div className="vfm-feedback-bar">
          {feedbackStatus === 'saved' ? (
            <span className="vfm-feedback-saved">✓ Учтено — Gemini увидит это на следующем ревью</span>
          ) : feedbackStatus === 'saving' ? (
            <span className="vfm-feedback-saving">Сохраняю…</span>
          ) : feedbackStatus === 'error' ? (
            <span className="vfm-feedback-err">Не удалось сохранить</span>
          ) : feedbackForm ? null : (
            <>
              <button type="button" className="vfm-btn-thumb vfm-btn-up" onClick={onSubmitCorrect}>
                👍 Верно
              </button>
              <button type="button" className="vfm-btn-thumb vfm-btn-down" onClick={onOpenIncorrect}>
                👎 Ошибся
              </button>
            </>
          )}
        </div>
        {feedbackForm && (
          <div className="vfm-feedback-form">
            <div className="vfm-feedback-form-label">Какие шаблоны ДОЛЖНЫ были быть?</div>
            <div className="vfm-feedback-checkboxes">
              {Object.keys(TPL_NAMES).sort((a, b) => tplLabel(a).localeCompare(tplLabel(b), 'ru')).map(k => (
                <label key={k} className="vfm-feedback-checkbox">
                  <input
                    type="checkbox"
                    checked={feedbackForm.correctTpls.includes(k)}
                    onChange={() => onFormChange(f => ({
                      ...f,
                      correctTpls: f.correctTpls.includes(k)
                        ? f.correctTpls.filter(x => x !== k)
                        : [...f.correctTpls, k],
                    }))}
                  />
                  <span className={SECONDARY.has(k) ? 'vfm-edit-sec' : ''}>{tplLabel(k)}</span>
                </label>
              ))}
            </div>
            <textarea
              className="vfm-feedback-comment"
              placeholder="Комментарий: почему именно так? (опционально)"
              rows={2}
              value={feedbackForm.comment}
              onChange={e => onFormChange(f => ({ ...f, comment: e.target.value }))}
            />
            <div className="vfm-feedback-form-actions">
              <button type="button" className="vfm-btn-secondary" onClick={() => onFormChange(null)}>
                Отмена
              </button>
              <button type="button" className="vfm-btn-primary" onClick={onSubmitIncorrect}>
                Сохранить как ошибку
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
