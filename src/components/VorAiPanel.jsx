// Верхняя панель превью-таблицы — «AI-пульт»: суммарка + кнопки
// «Проверить AI», «Найти упущенное» и «Предложить альтернативы».
// Вынесено из VorFillModal, чтобы уложиться в лимит 600 строк на файл.

export default function VorAiPanel({
  matchPreview, reviewsCount, proposeCount, techAdditionsCount,
  reviewing, proposing, advising, busy,
  onReview, onPropose, onAdvise,
  reviewProgress, proposeProgress, advisingProgress,
  reviewError,
}) {
  const anyAiBusy = reviewing || proposing || advising;
  return (
    <>
      <div className="vfm-ai-panel">
        <div className="vfm-ai-panel-title">🧠 AI-пульт Gemini</div>
        <div className="vfm-ai-panel-summary">
          <span>Распознано: <b>{matchPreview.matched}</b> из <b>{matchPreview.total}</b></span>
          {matchPreview.unmatched > 0 && (
            <span className="vfm-preview-warn"> · {matchPreview.unmatched} не распознано</span>
          )}
        </div>
        <div className="vfm-ai-panel-actions">
          <button
            type="button"
            className="vfm-review-btn"
            onClick={onReview}
            disabled={anyAiBusy || busy || matchPreview.matched === 0}
            title="Проверить подбор шаблонов с помощью Gemini 2.5 Flash"
          >
            {reviewing ? 'Ревью идёт…' : (reviewsCount > 0 ? 'Прогнать ревью ещё раз' : 'Проверить подбор AI')}
          </button>
          <button
            type="button"
            className="vfm-advise-btn"
            onClick={onAdvise}
            disabled={anyAiBusy || busy || matchPreview.matched === 0}
            title="Gemini посмотрит на технологию каждой позиции и предложит упущенные материалы/работы (мембраны, грунтовки, герметики и т. п.)"
          >
            {advising ? 'Gemini ищет…' : (techAdditionsCount > 0 ? '🔧 Найти упущенное ещё раз' : '🔧 Найти упущенное')}
          </button>
          {proposeCount > 0 && (
            <button
              type="button"
              className="vfm-propose-btn"
              onClick={onPropose}
              disabled={anyAiBusy || busy}
              title="Gemini предложит набор шаблонов для нераспознанных позиций и тех, где ревью дало низкую оценку"
            >
              {proposing ? 'Gemini думает…' : `🤖 Предложить альтернативы (${proposeCount})`}
            </button>
          )}
        </div>
      </div>

      {reviewing && (
        <div className="vfm-review-banner vfm-review-banner-running">
          <span className="vfm-review-spinner" />
          <span>Gemini проверяет позиции… <b>{reviewProgress.done}</b> из <b>{reviewProgress.total}</b></span>
        </div>
      )}
      {!reviewing && reviewsCount > 0 && (
        <div className="vfm-review-banner vfm-review-banner-done">
          <span>✓ Gemini проверил <b>{reviewsCount}</b> {reviewsCount === 1 ? 'позицию' : 'позиций'}. Наведите на кружок — короткий комментарий, клик — развёрнутое рассуждение.</span>
        </div>
      )}
      {reviewError && (
        <div className="vfm-review-banner vfm-review-banner-err">{reviewError}</div>
      )}
      {proposing && (
        <div className="vfm-review-banner vfm-review-banner-running">
          <span className="vfm-review-spinner" />
          <span>Gemini предлагает альтернативы… <b>{proposeProgress.done}</b> из <b>{proposeProgress.total}</b></span>
        </div>
      )}
      {advising && (
        <div className="vfm-review-banner vfm-review-banner-running">
          <span className="vfm-review-spinner" />
          <span>Gemini ищет упущенное… <b>{advisingProgress.done}</b> из <b>{advisingProgress.total}</b></span>
        </div>
      )}
      {!advising && techAdditionsCount > 0 && (
        <div className="vfm-review-banner vfm-review-banner-done">
          <span>🔧 Gemini нашёл упущения в <b>{techAdditionsCount}</b> {techAdditionsCount === 1 ? 'позиции' : 'позициях'}. Раскрой по значку 🔧 в строке.</span>
        </div>
      )}
    </>
  );
}
