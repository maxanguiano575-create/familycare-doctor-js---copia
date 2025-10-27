import React from 'react';
import './Dashboard.css';
import { useAuth } from '../../../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleRegister = () => {
    navigate('/registrarse');
  };

  const handleDataProtection = () => {
    console.log("Navegar a protección de datos");
  };

  const handleAskExpert = () => {
    console.log("Navegar a preguntas al experto");
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-top">
          <div className="logo-container">
            {/* LOGO CON IMAGEN Y FALLBACK */}
            <img 
              src="/imagenes/logosinfondo.png" 
              alt="FamilyCare Circle" 
              className="logo-image"
              onError={(e) => {
                e.target.style.display = 'none';
                // Si la imagen falla, mostrar fallback
                const fallback = document.querySelector('.logo-fallback');
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            {/* FALLBACK SI LA IMAGEN NO CARGA */}
            <div className="logo-fallback">
              <span className="logo-text">FAMILYCARE</span>
              <span className="logo-circle">●</span>
            </div>
          </div>
          <nav className="header-nav">
            <button onClick={handleDataProtection} className="nav-button">
              ¿Cómo proteges tus datos?
            </button>
            
            <button onClick={handleAskExpert} className="nav-button">
              Pregunta al experto
            </button>
            
            <button onClick={handleRegister} className="nav-button">
              Crear cuenta
            </button>
            
            {user ? (
              <button onClick={handleLogout} className="nav-button">
                Cerrar sesión
              </button>
            ) : (
              <Link to="/login" className="nav-button">
                Iniciar sesión
              </Link>
            )}
            
            <button className="nav-button">
              ¿Eres profesional de la salud?
            </button>
          </nav>
        </div>

        <div className="header-content">
          <div className="header-text">
            <h1>Bienvenido, {user?.name || 'Invitado'}</h1>
            <p>La salud que necesitas, a un click de distancia</p>
          </div>
          <div className="header-image">
            <img src="/imagenes/doctorconpacientes.jpg" alt="Doctor con pacientes" />
          </div>
        </div>
      </header>

      <div className="services-section">
        <div className="services-container">
          <div className="service-card">
            <div className="service-icon">🔍</div>
            <div className="service-content">
              <h3>Encuentra tu especialista</h3>
              <p>Las opiniones reales de miles de pacientes te ayudarán a tomar siempre la mejor decisión.</p>
            </div>
          </div>

          <div className="service-card">
            <div className="service-icon">📅</div>
            <div className="service-content">
              <h3>Pide cita de forma fácil</h3>
              <p>Elige la hora que prefieras y pide cita sin necesidad de llamar. Es fácil, cómodo y muy rápido.</p>
            </div>
          </div>

          <div className="service-card">
            <div className="service-icon">💬</div>
            <div className="service-content">
              <h3>Recordatorios por SMS</h3>
              <p>Te confirmaremos la cita al instante y te enviaremos un recordatorio a tu celular antes de la cita.</p>
            </div>
          </div>

          <div className="service-card">
            <div className="service-icon">💰</div>
            <div className="service-content">
              <h3>Sin costos adicionales</h3>
              <p>La gestión de citas es un servicio gratuito en nuestra plataforma.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;