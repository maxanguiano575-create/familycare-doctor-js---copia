import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

const Login = () => {
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login, error, clearError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    clearError();
  }, [credentials]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!credentials.email || !credentials.password) return;

    setLoading(true);
    clearError();

    try {
      const result = await login(credentials);
      if (result.success) navigate('/dashboard');
    } catch (error) {
      console.error('Error en login:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    navigate('/dashboard');
  };

  const handleCreateAccount = () => {
    navigate('/registrarse');
  };

  return (
    <div className="login-page">
      <header className="login-header">
        <div className="logo-container">
          <img src="/imagenes/logosinfondo.png" alt="FamilyCare Circle" />
        </div>

        <div className="login-icons">
          <button 
            type="button" 
            className="btn-cancel" 
            onClick={handleBackToDashboard}
          >
            Volver al inicio
          </button>
          <i className="icon">🔔</i>
          <i className="icon">✉️</i>
          <i className="icon">⚙️</i>
          <div className="profile-avatar">👤</div>
        </div>
      </header>

      <div className="login-card">
        <h2>Iniciar Sesión</h2>
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Correo electrónico</label>
            <input
              type="email"
              value={credentials.email}
              onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
              placeholder="doctor@familycare.com"
              required
              disabled={loading}
            />
          </div>

          <div className="form-row">
            <label>Contraseña</label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={handleCreateAccount}
              disabled={loading}
            >
              Crear cuenta
            </button>

            <button 
              type="submit" 
              className="btn-save" 
              disabled={loading}
            >
              {loading ? 'Iniciando...' : 'Ingresar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
