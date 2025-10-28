const express = require('express');
const cors = require('cors');
const mariadb = require('mariadb');

const app = express();

// ✅ CORS MEJORADO - PERMITE TODOS LOS ORIGENES
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false
}));

// Manejar preflight requests explícitamente
app.options('*', cors());

app.use(express.json());

// ✅ CONFIGURACIÓN PARA RAILWAY + LOCAL (SIMPLIFICADA)
const pool = mariadb.createPool({
  host: process.env.MYSQLHOST || '127.0.0.1', 
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'familycarecircledb',
  port: process.env.MYSQLPORT || 3306,
  ssl: process.env.MYSQLHOST ? { rejectUnauthorized: false } : false,
  connectionLimit: 5,
  bigIntAsNumber: true
});

// ✅ RUTA DE LOGIN ÚNICA (funciona para Web y Android)
app.post('/api/login', async (req, res) => {
  let conn;
  try {
    const { email, password } = req.body;
    
    // ✅ HEADERS CORS EXPLÍCITOS
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
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

    // ✅ HEADERS CORS
    res.header('Access-Control-Allow-Origin', '*');

    conn = await pool.getConnection();

    // Verificar si ya existe el correo
    const existeCorreo = await conn.query(
      "SELECT * FROM medicos WHERE correo = ?",
      [email]
    );

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

    if (existeCedula.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'La cédula profesional ya está registrada.'
      });
    }

    // ✅ INSERT CORREGIDO - SIN Horario_Consulta y Estado
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
    if (conn) conn.release();
  }
});

// ✅ RUTA DE REGISTRO USUARIO (Android) - SIN JWT NI BCRYPT
app.post('/api/register', async (req, res) => {
  let conn;
  try {
    console.log('📥 Datos recibidos para registro Android:', req.body);
    
    const { nombre, apellidos, email, password, telefono, fechaNacimiento, sexo, tipoUsuario } = req.body;

    // ✅ HEADERS CORS
    res.header('Access-Control-Allow-Origin', '*');

    // Validaciones (estructura Android)
    if (!nombre || !apellidos || !email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Nombre, apellidos, email y password son requeridos' 
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
      [nombre, apellidos, email, password, telefono || null, fechaNacimiento || null, sexo || null, tipoUsuario || 'Paciente']
    );

    const userId = Number(result.insertId);

    console.log('✅ Usuario Android registrado con ID:', userId);

    res.status(201).json({ 
      success: true,
      message: 'Usuario registrado exitosamente',
      userId: userId
    });

  } catch (error) {
    console.error('💥 ERROR en registro Android:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error interno del servidor: ' + error.message
    });
  } finally {
    if (conn) conn.release();
  }
});

// ✅ RUTA PARA OBTENER PERFIL (Android) - SIN AUTENTICACIÓN POR AHORA
app.get('/api/profile', async (req, res) => {
  let conn;
  try {
    // ✅ HEADERS CORS
    res.header('Access-Control-Allow-Origin', '*');
    
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'ID de usuario requerido' 
      });
    }

    conn = await pool.getConnection();
    const users = await conn.query(
      'SELECT ID_Usuario, Nombre, Apellidos, Correo, Telefono, Fecha_Nacimiento, Sexo, Tipo_Usuario FROM usuarios WHERE ID_Usuario = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuario no encontrado' 
      });
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
    // ✅ HEADERS CORS
    res.header('Access-Control-Allow-Origin', '*');
    
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
  res.header('Access-Control-Allow-Origin', '*');
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
    res.header('Access-Control-Allow-Origin', '*');
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
  res.header('Access-Control-Allow-Origin', '*');
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
      profile: 'GET /api/profile?userId=ID',
      // Comunes
      health: 'GET /api/health',
      test: 'GET /api/test-db'
    }
  });
});

// ✅ MANEJO DE ERRORES
app.use('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.status(404).json({ 
    success: false,
    error: 'Ruta no encontrada' 
  });
});

// ✅ PUERTO PARA PRODUCCIÓN
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 Servidor FamilyCare CORREGIDO');
  console.log(`📍 Puerto: ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️ Base de datos: ${process.env.MYSQLHOST ? 'Railway MySQL' : 'Local'}`);
  console.log('✅ CORS: Configurado para todos los orígenes');
  console.log('✅ Dependencias: Solo express, cors, mariadb');
  console.log('✅ Web: POST /api/registrarse');
  console.log('✅ Android: POST /api/register');
  console.log('✅ Login: POST /api/login (ambos)');
  console.log('✅ LISTO PARA WEB Y ANDROID ✅');
  console.log('=================================');
});