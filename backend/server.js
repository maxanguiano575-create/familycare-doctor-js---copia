const express = require('express');
const cors = require('cors');
const mariadb = require('mariadb');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = 'familycare_secret_key_2024';

// ✅ CORS MEJORADO PARA WEB + ANDROID
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: false
}));

app.use(express.json());

// ✅ CONFIGURACIÓN PARA RAILWAY
const pool = mariadb.createPool({
  host: process.env.MYSQLHOST || '127.0.0.1', 
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || 'root',
  database: process.env.MYSQLDATABASE || 'familycarecircledb',
  port: process.env.MYSQLPORT || 3306,
  ssl: process.env.MYSQLHOST ? { rejectUnauthorized: false } : false,
  connectionLimit: 5,
  bigIntAsNumber: true
});

// ✅ MIDDLEWARE DE AUTENTICACIÓN (para Android)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token de acceso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// ✅ RUTA DE LOGIN ÚNICA (funciona para Web y Android)
app.post('/api/login', async (req, res) => {
  let conn;
  try {
    const { email, password } = req.body;
    
    conn = await pool.getConnection();
    
    // Buscar en ambas tablas
    const medicosRows = await conn.query("SELECT * FROM medicos WHERE Correo = ?", [email]);
    let user = null;
    let userType = '';

    if (medicosRows.length > 0) {
      user = medicosRows[0];
      userType = 'Medico';
    } else {
      const usuariosRows = await conn.query("SELECT * FROM usuarios WHERE Correo = ?", [email]);
      if (usuariosRows.length > 0) {
        user = usuariosRows[0];
        userType = user.Tipo_Usuario || 'Paciente';
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuario no encontrado' });
    }

    // Verificar contraseña (sin bcrypt)
    const passwordField = user.Contraseña || user.Contrasena;
    if (passwordField !== password) {
      return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    }

    // Generar token (para Android)
    const token = jwt.sign(
      { 
        userId: Number(user.ID_Medico || user.ID_Usuario),
        email: user.Correo,
        nombre: user.Nombre,
        role: userType
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Respuesta compatible con ambos
    const responseData = {
      success: true,
      user: {
        id: Number(user.ID_Medico || user.ID_Usuario),
        name: `${user.Nombre} ${user.Apellidos}`,
        email: user.Correo,
        role: userType,
        specialty: user.Especialidad || 'Paciente'
      }
    };

    // Agregar token para Android
    if (req.headers['user-agent']?.includes('Android') || req.body.source === 'android') {
      responseData.token = token;
      responseData.message = 'Login exitoso';
    }

    res.json(responseData);

  } catch (err) {
    console.log('Error en login:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTA DE REGISTRO MÉDICO (Web)
app.post('/api/registrarse', async (req, res) => {
  let conn;
  try {
    const { nombre, apellidos, especialidad, cedula, telefono, email, password } = req.body;

    conn = await pool.getConnection();

    // Verificar si ya existe
    const existeCorreo = await conn.query("SELECT * FROM medicos WHERE correo = ?", [email]);
    const existeCedula = await conn.query("SELECT * FROM medicos WHERE Cedula_Profesional = ?", [cedula]);

    if (existeCorreo.length > 0) {
      return res.status(400).json({ success: false, message: 'El correo ya está registrado.' });
    }
    if (existeCedula.length > 0) {
      return res.status(400).json({ success: false, message: 'La cédula profesional ya está registrada.' });
    }

    const result = await conn.query(
      `INSERT INTO medicos (nombre, apellidos, especialidad, Cedula_Profesional, telefono, correo, contraseña)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [nombre, apellidos, especialidad, cedula, telefono || null, email, password]
    );

    res.json({
      success: true,
      message: 'Médico registrado correctamente',
      id: Number(result.insertId)
    });

  } catch (err) {
    console.error('Error al registrar médico:', err);
    res.status(500).json({ success: false, message: 'Error del servidor: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTA DE REGISTRO USUARIO (Android) - SIN BCRYPT
app.post('/api/register', async (req, res) => {
  let conn;
  try {
    const { nombre, apellidos, email, password, telefono, fechaNacimiento, sexo, tipoUsuario } = req.body;

    if (!nombre || !apellidos || !email || !password) {
      return res.status(400).json({ success: false, error: 'Nombre, apellidos, email y password son requeridos' });
    }

    conn = await pool.getConnection();

    // Verificar si el usuario ya existe
    const existingUser = await conn.query('SELECT ID_Usuario FROM usuarios WHERE Correo = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ success: false, error: 'El usuario ya existe' });
    }

    // SIN hash de contraseña
    const result = await conn.query(
      `INSERT INTO usuarios (Nombre, Apellidos, Correo, Contrasena, Telefono, Fecha_Nacimiento, Sexo, Tipo_Usuario) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre, apellidos, email, password, telefono || null, fechaNacimiento, sexo, tipoUsuario || 'Paciente']
    );

    // Generar token para Android
    const token = jwt.sign(
      { 
        userId: Number(result.insertId),
        email: email,
        nombre: nombre 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      success: true,
      message: 'Usuario registrado exitosamente',
      userId: Number(result.insertId),
      token: token
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTAS ADICIONALES PARA ANDROID
app.get('/api/profile', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const users = await conn.query(
      'SELECT ID_Usuario, Nombre, Apellidos, Correo, Telefono, Fecha_Nacimiento, Sexo, Tipo_Usuario FROM usuarios WHERE ID_Usuario = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    const user = users[0];
    res.json({ 
      success: true, 
      user: {
        id: Number(user.ID_Usuario),
        nombre: user.Nombre,
        apellidos: user.Apellidos,
        email: user.Correo,
        telefono: user.Telefono,
        fechaNacimiento: user.Fecha_Nacimiento,
        sexo: user.Sexo,
        tipoUsuario: user.Tipo_Usuario
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTAS COMUNES
app.get('/api/medicos', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const medicos = await conn.query("SELECT * FROM medicos");
    const medicosConvertidos = medicos.map(medico => ({
      ...medico,
      ID_Medico: Number(medico.ID_Medico)
    }));
    res.json({ success: true, medicos: medicosConvertidos });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error del servidor' });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true,
    message: '🚀 Servidor FamilyCare funcionando',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

app.get('/api/test-db', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query("SELECT 1 as test");
    res.json({ success: true, message: '✅ Conexión a BD exitosa' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error de conexión a BD: ' + err.message });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Servidor FamilyCare funcionando para Web y Android',
    endpoints: {
      login: 'POST /api/login',
      registerMedico: 'POST /api/registrarse',
      registerUser: 'POST /api/register',
      profile: 'GET /api/profile',
      medicos: 'GET /api/medicos',
      health: 'GET /api/health'
    }
  });
});

// ✅ PUERTO PARA PRODUCCIÓN
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 Servidor FamilyCare UNIFICADO');
  console.log('📍 Puerto: ' + PORT);
  console.log('✅ Web: POST /api/registrarse');
  console.log('✅ Android: POST /api/register');
  console.log('✅ Login: POST /api/login (ambos)');
  console.log('✅ LISTO PARA WEB Y ANDROID ✅');
  console.log('=================================');
});