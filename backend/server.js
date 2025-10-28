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
// ✅ RUTA TEMPORAL PARA INICIALIZAR BD COMPLETA (ejecutar una vez)
app.get('/api/init-complete-db', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('🗄️ Ejecutando script COMPLETO de base de datos...');

    // TABLA USUARIOS
    await conn.query(`CREATE TABLE IF NOT EXISTS usuarios (
      ID_Usuario int(11) NOT NULL AUTO_INCREMENT,
      Nombre varchar(100) NOT NULL,
      Apellidos varchar(100) NOT NULL,
      Fecha_Nacimiento date DEFAULT NULL,
      Sexo enum('Masculino','Femenino') DEFAULT NULL,
      Correo varchar(150) NOT NULL,
      Telefono varchar(20) DEFAULT NULL,
      Contraseña varchar(255) NOT NULL,
      Tipo_Usuario enum('Paciente','Familiar') NOT NULL,
      PRIMARY KEY (ID_Usuario),
      UNIQUE KEY Correo (Correo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // TABLA MEDICOS
    await conn.query(`CREATE TABLE IF NOT EXISTS medicos (
      ID_Medico int(11) NOT NULL AUTO_INCREMENT,
      Nombre varchar(100) NOT NULL,
      Apellidos varchar(100) NOT NULL,
      Especialidad varchar(100) NOT NULL,
      Cedula_Profesional varchar(50) NOT NULL,
      Correo varchar(150) NOT NULL,
      Telefono varchar(20) DEFAULT NULL,
      Contraseña varchar(255) NOT NULL,
      Horario_Consulta text DEFAULT NULL,
      Estado enum('Activo','Inactivo') DEFAULT 'Activo',
      PRIMARY KEY (ID_Medico),
      UNIQUE KEY UQ_Medico_Correo (Correo),
      UNIQUE KEY UQ_Medico_Cedula (Cedula_Profesional)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // TABLA RECETAS
    await conn.query(`CREATE TABLE IF NOT EXISTS recetas (
      ID_Receta int(11) NOT NULL AUTO_INCREMENT,
      ID_Medico int(11) NOT NULL,
      ID_Paciente int(11) NOT NULL,
      Fecha_Emision date NOT NULL,
      Fecha_Vencimiento date NOT NULL,
      Diagnostico text NOT NULL,
      Medicamentos text NOT NULL,
      Dosis varchar(100) NOT NULL,
      Frecuencia varchar(100) NOT NULL,
      Horario time NOT NULL,
      Duracion_Dias int(11) NOT NULL,
      Instrucciones_Especificas text NOT NULL,
      Via_Administracion varchar(50) DEFAULT NULL,
      Estado enum('Activa','Completada','Vencida') DEFAULT 'Activa',
      PRIMARY KEY (ID_Receta),
      KEY fk_receta_medico (ID_Medico),
      KEY fk_receta_paciente (ID_Paciente),
      CONSTRAINT fk_receta_medico FOREIGN KEY (ID_Medico) REFERENCES medicos (ID_Medico),
      CONSTRAINT fk_receta_paciente FOREIGN KEY (ID_Paciente) REFERENCES usuarios (ID_Usuario)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // TABLA CITAS MÉDICAS
    await conn.query(`CREATE TABLE IF NOT EXISTS citas_medicas (
      ID_Cita int(11) NOT NULL AUTO_INCREMENT,
      ID_Paciente int(11) NOT NULL,
      ID_Medico int(11) NOT NULL,
      Fecha date NOT NULL,
      Hora time NOT NULL,
      Especialidad varchar(100) DEFAULT NULL,
      Ubicacion varchar(200) DEFAULT NULL,
      Motivo text DEFAULT NULL,
      Estado enum('Pendiente','Confirmada','Completada','Cancelada') DEFAULT 'Pendiente',
      PRIMARY KEY (ID_Cita),
      KEY fk_citas_paciente (ID_Paciente),
      KEY fk_citas_medico (ID_Medico),
      CONSTRAINT fk_citas_paciente FOREIGN KEY (ID_Paciente) REFERENCES usuarios (ID_Usuario),
      CONSTRAINT fk_citas_medico FOREIGN KEY (ID_Medico) REFERENCES medicos (ID_Medico)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // TABLA HISTORIAL PACIENTE
    await conn.query(`CREATE TABLE IF NOT EXISTS historial_paciente (
      ID_Historial int(11) NOT NULL AUTO_INCREMENT,
      ID_Paciente int(11) NOT NULL,
      ID_Receta int(11) NOT NULL,
      Tipo_Registro enum('Receta','Consulta','Alergia','Diagnostico') NOT NULL,
      Descripcion text NOT NULL,
      Fecha_Registro datetime NOT NULL,
      Notas_Adicionales text DEFAULT NULL,
      PRIMARY KEY (ID_Historial),
      KEY fk_historial_paciente (ID_Paciente),
      KEY fk_historial_receta (ID_Receta),
      CONSTRAINT fk_historial_paciente FOREIGN KEY (ID_Paciente) REFERENCES usuarios (ID_Usuario),
      CONSTRAINT fk_historial_receta FOREIGN KEY (ID_Receta) REFERENCES recetas (ID_Receta)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // TABLA NOTIFICACIONES
    await conn.query(`CREATE TABLE IF NOT EXISTS notificaciones (
      ID_Notificacion int(11) NOT NULL AUTO_INCREMENT,
      ID_Usuario int(11) NOT NULL,
      ID_Receta int(11) NOT NULL,
      Tipo enum('Recordatorio de medicamento','Cita medica','Alerta de emergencia') NOT NULL,
      Mensaje text NOT NULL,
      Fecha_Hora_Programada datetime NOT NULL,
      Fecha_Hora_Envio datetime DEFAULT NULL,
      Estado enum('Pendiente','Enviada','Leída') DEFAULT 'Pendiente',
      PRIMARY KEY (ID_Notificacion),
      KEY fk_notif_usuario (ID_Usuario),
      KEY fk_notif_receta (ID_Receta),
      CONSTRAINT fk_notif_usuario FOREIGN KEY (ID_Usuario) REFERENCES usuarios (ID_Usuario),
      CONSTRAINT fk_notif_receta FOREIGN KEY (ID_Receta) REFERENCES recetas (ID_Receta)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // TABLA FAMILIARES
    await conn.query(`CREATE TABLE IF NOT EXISTS familiares (
      ID_Familiar int(11) NOT NULL AUTO_INCREMENT,
      Nombre varchar(100) NOT NULL,
      Apellidos varchar(100) NOT NULL,
      Relacion varchar(50) DEFAULT NULL,
      Telefono varchar(20) DEFAULT NULL,
      Correo varchar(150) DEFAULT NULL,
      PRIMARY KEY (ID_Familiar)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // TABLA USUARIO_FAMILIAR
    await conn.query(`CREATE TABLE IF NOT EXISTS usuario_familiar (
      ID_Usuario int(11) NOT NULL,
      ID_Familiar int(11) NOT NULL,
      PRIMARY KEY (ID_Usuario,ID_Familiar),
      KEY fk_uf_familiar (ID_Familiar),
      CONSTRAINT fk_uf_familiar FOREIGN KEY (ID_Familiar) REFERENCES familiares (ID_Familiar),
      CONSTRAINT fk_uf_usuario FOREIGN KEY (ID_Usuario) REFERENCES usuarios (ID_Usuario)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // INSERTAR MÉDICO DE PRUEBA
    await conn.query(`INSERT IGNORE INTO medicos 
      (Nombre, Apellidos, Especialidad, Cedula_Profesional, Correo, Telefono, Contraseña, Horario_Consulta) 
      VALUES ('Juan', 'Pérez García', 'Medicina General', 'CP123456', 'doctor@test.com', '555-1234', '123456', 'Lunes a Viernes 8:00 - 16:00')`);

    console.log('✅ Base de datos COMPLETA inicializada con 8 tablas');
    
    res.json({ 
      success: true, 
      message: '✅ Base de datos COMPLETA inicializada exitosamente',
      tables: ['usuarios', 'medicos', 'recetas', 'citas_medicas', 'historial_paciente', 'notificaciones', 'familiares', 'usuario_familiar']
    });
    
  } catch (error) {
    console.error('❌ Error inicializando BD:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    if (conn) conn.release();
  }
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