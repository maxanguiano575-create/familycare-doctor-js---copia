import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const savedUser = localStorage.getItem('familycare_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    try {
      setError(''); // Limpiar error anterior
      const response = await fetch('http://localhost:3001/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message);
      }

      const userData = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        specialty: data.user.specialty
      };

      setUser(userData);
      localStorage.setItem('familycare_user', JSON.stringify(userData));
      return { success: true };

    } catch (error) {
      console.error('Error en login:', error);
      setError(error.message); // Guardar el error para mostrarlo
      return { 
        success: false, 
        message: error.message
      };
    }
  };

  const logout = () => {
    setUser(null);
    setError('');
    localStorage.removeItem('familycare_user');
  };

  const isAuthenticated = () => {
    return !!user;
  };

  const clearError = () => {
    setError('');
  };

  const value = { 
    user, 
    login, 
    logout, 
    loading, 
    error,
    clearError,
    isAuthenticated 
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};