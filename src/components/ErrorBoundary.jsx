import { Component } from 'react';
import './ErrorBoundary.css';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { error, info } = this.state;
    return (
      <div className="eb-wrap">
        <div className="eb-card">
          <div className="eb-emoji">⚠️</div>
          <h1 className="eb-title">Что-то пошло не так</h1>
          <p className="eb-text">
            Произошла непредвиденная ошибка на портале. Попробуйте обновить страницу.
            Если не помогает — напишите Максиму.
          </p>
          <div className="eb-actions">
            <button className="eb-btn-primary" onClick={this.handleReload}>Обновить страницу</button>
            <button className="eb-btn-secondary" onClick={this.handleGoHome}>На главную</button>
          </div>
          <details className="eb-details">
            <summary>Техническая информация (для разработчика)</summary>
            <div className="eb-error">{error.name}: {error.message}</div>
            {error.stack && <pre className="eb-stack">{error.stack}</pre>}
            {info?.componentStack && <pre className="eb-stack">{info.componentStack}</pre>}
          </details>
        </div>
      </div>
    );
  }
}
