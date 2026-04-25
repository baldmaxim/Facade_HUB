import './VorPipelineSteps.css';

const ICONS = {
  pending: '⏸',
  running: '⏳',
  done: '✓',
  error: '✗',
};

const LABELS = {
  pending: 'Ожидание',
  running: 'Выполняется...',
  done: 'Готово',
  error: 'Ошибка',
};

export default function VorPipelineSteps({ steps }) {
  if (!steps || steps.length === 0) return null;
  return (
    <div className="vps-list">
      {steps.map((step, idx) => (
        <div key={step.id} className={`vps-row vps-${step.status}`}>
          <div className="vps-icon" aria-label={LABELS[step.status]}>
            {ICONS[step.status]}
          </div>
          <div className="vps-body">
            <div className="vps-title">
              <span className="vps-num">{idx + 1}.</span>{' '}
              <span className="vps-label">{step.label}</span>
            </div>
            {step.detail && <div className="vps-detail">{step.detail}</div>}
            {step.status === 'error' && step.errorMessage && (
              <div className="vps-error">⚠ {step.errorMessage}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
