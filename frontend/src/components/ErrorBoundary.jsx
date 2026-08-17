import React from 'react';

// Red de seguridad a nivel de toda la app: si un componente tira una
// excepción durante el render, React normalmente desmonta el árbol entero
// y deja una pantalla en blanco. Esto lo atrapa y muestra un mensaje con
// un botón para volver al menú, sin perder el resto del progreso guardado
// (torneo, ejército, historial — todo eso vive en localStorage, así que no
// se pierde nada aunque esta pantalla puntual se haya roto).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Error atrapado por ErrorBoundary:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-screen">
          <span className="eyebrow">Ups</span>
          <h2>Algo salió mal en esta pantalla</h2>
          <p className="hint-text">
            Se rompió algo inesperado. Tu progreso guardado (torneo, ejército, historial) sigue intacto — esto
            no lo toca, vive aparte. Vuelve al menú e intenta de nuevo.
          </p>
          <button className="primary-btn" onClick={this.handleReset}>Volver al menú</button>
        </div>
      );
    }
    return this.props.children;
  }
}
