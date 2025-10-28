const express = require('express');
const cors = require('cors');
const mariadb = require('mariadb');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = 'familycare_secret_key_2024';

// ✅ CORS MEJORADO PARA WEB + ANDROID + LOCALHOST
app.use(cors({
    origin: ['http://localhost:8081', 'http://10.0.2.2:8081', '*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// ✅ CONFIGURACIÓN PARA RAILWAY + LOCAL
const pool = mariadb.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1', 
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'familycarecircledb',
  port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
  ssl: (process.env.MYSQLHOST || process.env.DB_HOST) ? { rejectUnauthorized: false } : false,
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
    
    // Buscar en ambas tablas (Web + Android)
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
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }

    // Verificar contraseña (sin bcrypt por compatibilidad)
    const passwordField = user.Contraseña || user.Contrasena;
    if (passwordField !== password) {
      return res.status(401).json({ 
        success: false, 
        message: 'Contraseña incorrecta' 
      });
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
    res.status(500).json({ 
      success: false, 
      message: 'Error del servidor' 
    });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTA DE REGISTRO MÉDICO (Web) - RESPETANDO ESTRUCTURA ORIGINAL
app.post('/api/registrarse', async (req, res) => {
  let conn;
  try {
    console.log('📨 Datos recibidos para registro médico:', req.body);
    
    const nombre = req.body.nombre;
    const apellidos = req.body.apellidos;
    const especialidad = req.body.especialidad;
    const cedula = req.body.cedula || req.body.Cedula_Profesional;
    const telefono = req.body.telefono;
    const email = req.body.email || req.body.correo;
    const password = req.body.password || req.body.contraseña;

    console.log('🔧 Datos procesados médico:', {
      nombre, apellidos, especialidad, cedula, telefono, email, password
    });

    conn = await pool.getConnection();
    console.log('✅ Conexión a BD establecida');

    // Verificar si ya existe el correo
    const existeCorreo = await conn.query(
      "SELECT * FROM medicos WHERE correo = ?",
      [email]
    );

    console.log('🔍 Resultado de búsqueda de correo:', existeCorreo.length);

    if (existeCorreo.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El correo ya está registrado.'
      });
    }

    // Verificar si ya existe la cédula profesional
    const existeCedula = await conn.query(
      "SELECT * FROM medicos WHERE Cedula_Profesional = ?",
      [cedula]
    );

    console.log('🔍 Resultado de búsqueda de cédula:', existeCedula.length);

    if (existeCedula.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'La cédula profesional ya está registrada.'
      });
    }

    // ✅ INSERT CORREGIDO - SIN Horario_Consulta y Estado
    console.log('📝 Insertando nuevo médico...');
    const result = await conn.query(
      `INSERT INTO medicos 
       (nombre, apellidos, especialidad, Cedula_Profesional, telefono, correo, contraseña)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre, 
        apellidos, 
        especialidad, 
        cedula, 
        telefono || null, 
        email, 
        password
      ]
    );

    console.log('✅ Médico insertado con ID:', result.insertId);

    const responseData = {
      success: true,
      message: 'Médico registrado correctamente',
      id: Number(result.insertId)
    };

    res.json(responseData);

  } catch (err) {
    console.error('❌ Error al registrar médico:', err);
    res.status(500).json({
      success: false,
      message: 'Error del servidor: ' + err.message
    });
  } finally {
    if (conn) {
      conn.release();
      console.log('🔓 Conexión liberada');
    }
  }
});

// ✅ RUTA DE REGISTRO USUARIO (Android) - RESPETANDO ESTRUCTURA ANDROID
app.post('/api/register', async (req, res) => {
  let conn;
  try {
    console.log('📥 Datos recibidos para registro Android:', req.body);
    
    const { nombre, apellidos, email, password, telefono, fechaNacimiento, sexo, tipoUsuario } = req.body;

    // Validaciones (estructura Android)
    if (!nombre || !apellidos || !email || !password || !fechaNacimiento || !tipoUsuario) {
      return res.status(400).json({ 
        success: false,
        error: 'Nombre, apellidos, email, password, fecha de nacimiento y tipo de usuario son requeridos' 
      });
    }

    conn = await pool.getConnection();

    // Verificar si el usuario ya existe
    const existingUser = await conn.query(
      'SELECT ID_Usuario FROM usuarios WHERE Correo = ?',
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'El usuario ya existe' 
      });
    }

    // SIN hash de contraseña por compatibilidad
    const result = await conn.query(
      `INSERT INTO usuarios (Nombre, Apellidos, Correo, Contrasena, Telefono, Fecha_Nacimiento, Sexo, Tipo_Usuario) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre, apellidos, email, password, telefono || null, fechaNacimiento, sexo, tipoUsuario]
    );

    // ✅ Convertir BigInt a Number (estructura Android)
    const userId = Number(result.insertId);

    console.log('✅ Usuario Android registrado con ID:', userId);

    // Generar token para Android
    const token = jwt.sign(
      { 
        userId: userId,
        email: email,
        nombre: nombre 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      success: true,
      message: 'Usuario registrado exitosamente',
      userId: userId,
      token: token
    });

  } catch (error) {
    console.error('💥 ERROR en registro Android:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor'
    });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTA PARA OBTENER PERFIL (Android) - RESPETANDO ESTRUCTURA ANDROID
app.get('/api/profile', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const users = await conn.query(
      'SELECT ID_Usuario, Nombre, Apellidos, Correo, Telefono, Fecha_Nacimiento, Sexo, Tipo_Usuario FROM usuarios WHERE ID_Usuario = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuario no encontrado' 
      });
    }

    const user = users[0];
    // Convertir BigInt a Number
    const userId = Number(user.ID_Usuario);

    res.json({ 
      success: true, 
      user: {
        id: userId,
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
    console.error('Error en perfil:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor' 
    });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTA PARA OBTENER MÉDICOS (Web)
app.get('/api/medicos', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const medicos = await conn.query("SELECT * FROM medicos");
    
    const medicosConvertidos = medicos.map(medico => ({
      ...medico,
      ID_Medico: Number(medico.ID_Medico)
    }));
    
    res.json({
      success: true,
      medicos: medicosConvertidos
    });
  } catch (err) {
    console.error('Error al obtener médicos:', err);
    res.status(500).json({
      success: false,
      message: 'Error del servidor'
    });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTAS DE VERIFICACIÓN (Ambos)
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
    res.json({ 
      success: true, 
      message: '✅ Conexión a BD exitosa' 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: 'Error de conexión a BD: ' + err.message 
    });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTA DE BIENVENIDA
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Servidor FamilyCare funcionando para Web y Android',
    environment: process.env.NODE_ENV || 'development',
    database: {
      host: process.env.MYSQLHOST || 'local',
      connected: !!process.env.MYSQLHOST
    },
    endpoints: {
      // Web
      login: 'POST /api/login',
      registerMedico: 'POST /api/registrarse', 
      medicos: 'GET /api/medicos',
      // Android
      registerUser: 'POST /api/register',
      profile: 'GET /api/profile',
      // Comunes
      health: 'GET /api/health',
      test: 'GET /api/test-db'
    }
  });
});

// ✅ MANEJO DE ERRORES
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Ruta no encontrada' 
  });
});

// ✅ PUERTO PARA PRODUCCIÓN
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 Servidor FamilyCare UNIFICADO');
  console.log(`📍 Puerto: ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️ Base de datos: ${process.env.MYSQLHOST ? 'Railway MySQL' : 'Local'}`);
  console.log('✅ Web: POST /api/registrarse');
  console.log('✅ Android: POST /api/register');
  console.log('✅ Login: POST /api/login (ambos)');
  console.log('✅ LISTO PARA WEB Y ANDROID ✅');
  console.log('=================================');
});

// ✅ MANEJO GRACEFUL DE CIERRE
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando servidor...');
  await pool.end();
  process.exit(0);
});