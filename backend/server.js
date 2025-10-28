const express = require('express');
const cors = require('cors');
const mariadb = require('mariadb');

const app = express();

// ✅ CORS MEJORADO PARA PRODUCCIÓN
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: false
}));

app.use(express.json());

// ✅ CONFIGURACIÓN PARA RAILWAY (CORREGIDA)
const pool = mariadb.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1', 
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || 'root',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'familycarecircledb',
  port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
  ssl: (process.env.MYSQLHOST || process.env.DB_HOST) ? { rejectUnauthorized: false } : false,
  connectionLimit: 5,
  bigIntAsNumber: true
});

// RUTA PARA LOGIN DE DOCTORES
app.post('/api/login', async (req, res) => {
  let conn;
  try {
    const { email, password } = req.body;
    
    conn = await pool.getConnection();
    
    // Buscar en la tabla medicos
    const medicosRows = await conn.query(
      "SELECT * FROM medicos WHERE Correo = ?",
      [email]
    );

    let user = null;
    let userType = '';

    if (medicosRows.length > 0) {
      user = medicosRows[0];
      userType = 'Medico';
    } else {
      const usuariosRows = await conn.query(
        "SELECT * FROM usuarios WHERE Correo = ?",
        [email]
      );
      
      if (usuariosRows.length > 0) {
        user = usuariosRows[0];
        userType = user.Tipo_Usuario;
      }
    }

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado' 
      });
    }

    // Verificar contraseña
    if (user.Contraseña !== password) {
      return res.status(401).json({ 
        success: false, 
        message: 'Contraseña incorrecta' 
      });
    }

    // Login exitoso
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

// RUTA PARA REGISTRO DE MÉDICOS - SIN HORARIO_CONSULTA Y ESTADO
app.post('/api/registrarse', async (req, res) => {
  let conn;
  try {
    console.log('📨 Datos recibidos para registro:', req.body);
    
    const nombre = req.body.nombre;
    const apellidos = req.body.apellidos;
    const especialidad = req.body.especialidad;
    const cedula = req.body.cedula || req.body.Cedula_Profesional;
    const telefono = req.body.telefono;
    const email = req.body.email || req.body.correo;
    const password = req.body.password || req.body.contraseña;

    console.log('🔧 Datos procesados:', {
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

// RUTA PARA OBTENER MÉDICOS
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

// RUTA PARA VERIFICAR CONEXIÓN
app.get('/api/test-db', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query("SELECT 1 as test");
    
    res.json({
      success: true,
      message: 'Conexión a la base de datos exitosa',
      test: result
    });
  } catch (err) {
    console.error('Error de conexión a BD:', err);
    res.status(500).json({
      success: false,
      message: 'Error de conexión a la base de datos: ' + err.message
    });
  } finally {
    if (conn) conn.release();
  }
});

// RUTA DE BIENVENIDA
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Servidor FamilyCare Circle funcionando',
    environment: process.env.NODE_ENV || 'development',
    database: {
      host: process.env.MYSQLHOST || 'local',
      connected: !!process.env.MYSQLHOST
    },
    endpoints: {
      login: 'POST /api/login',
      register: 'POST /api/registrarse', 
      medicos: 'GET /api/medicos',
      test: 'GET /api/test-db'
    }
  });
});

// ✅ PUERTO PARA PRODUCCIÓN
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 Servidor FamilyCare Circle');
  console.log(`📍 Puerto: ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Base de datos: ${process.env.MYSQLHOST ? 'Railway MySQL' : 'Local'}`);
  console.log('✅ Login: POST /api/login');
  console.log('✅ Registro: POST /api/registrarse');
  console.log('✅ LISTO PARA RAILWAY ✅');
  console.log('=================================');
});