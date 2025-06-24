// server.js

// 1. Importaciones y configuración inicial
require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors'); // <-- Importas cors
const admin = require('firebase-admin');

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : require('./serviceAccountKey.json');

const app = express();
const port = process.env.PORT || 3000;

// 2. Inicializar Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth(); 

// --- 3. CONFIGURACIÓN DE CORS (LA SOLUCIÓN) ---

// Lista de dominios que tienen permiso para acceder a tu API
const whitelist = [
    'http://localhost:4200', // Para tu desarrollo local
    'https://tu-proyecto-angular.web.app', // <-- ¡IMPORTANTE! Reemplaza esto con la URL real de tu app en Firebase Hosting
    'https://tu-proyecto-angular.firebaseapp.com' // <-- Añade esta también por si acaso
];

const corsOptions = {
  origin: function (origin, callback) {
    // Si el origen de la petición está en nuestra lista blanca, o si no hay origen (como en Postman), permitimos la petición.
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  }
};

// Usa la configuración de CORS en tu aplicación
app.use(cors(corsOptions));


// 4. Middlewares para parsear el body de las peticiones
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ... (tu configuración de Nodemailer)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// =================================================================
// 5. ENDPOINTS DE LA API
// =================================================================

// --- ENDPOINT PARA ENVIAR CORREO DE RECUPERACIÓN ---
app.post('/send-recovery-email', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ message: 'El nombre de usuario es requerido.' });
  }

  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('username', '==', username).limit(1).get();

    if (snapshot.empty) {
      return res.status(200).json({ message: 'Si el usuario existe, se ha enviado un correo.' });
    }

    const userData = snapshot.docs[0].data();
    const userEmail = userData.email;

    if (!userEmail) {
      return res.status(500).json({ message: 'El usuario encontrado no tiene un email asociado.' });
    }

    // *** CAMBIO IMPORTANTE PARA PRODUCCIÓN ***
    // Ahora el link se construye con la URL de tu frontend, leída desde las variables de entorno.
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const recoveryLink = `${frontendUrl}/cambiar-contrasena/${userEmail}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: 'Recuperación de Contraseña',
      html: `
        <h1>Recupera tu acceso</h1>
        <p>Hola ${username},</p>
        <p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
        <a href="${recoveryLink}" style="padding: 10px 15px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
        <p>Si no solicitaste esto, puedes ignorar este correo.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Si el usuario existe, se ha enviado un correo.' });

  } catch (error) {
    res.status(500).json({ message: 'Ocurrió un error en el servidor.' });
  }
});

app.post('/cambiar-contrasena', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
      return res.status(400).json({ message: 'El email y la nueva contraseña son requeridos.' });
  }

  try {
      const userRecord = await auth.getUserByEmail(email);
      const uid = userRecord.uid;
      await auth.updateUser(uid, { password: newPassword });
      const userDocRef = db.collection('users').doc(uid);
      await userDocRef.update({ blocked: false });
      
      console.log(`Contraseña actualizada y cuenta DESBLOQUEADA para: ${email}`);
      res.status(200).json({ message: 'Tu contraseña ha sido actualizada y tu cuenta ha sido desbloqueada.' });

  } catch (error) {
      console.error('Error al cambiar la contraseña:', error);
      if (error.code === 'auth/user-not-found') {
           return res.status(404).json({ message: 'No se encontró un usuario con ese correo electrónico.' });
      }
      res.status(500).json({ message: 'Ocurrió un error en el servidor.' });
  }
});



app.get('/api/informacionQR/:id', async (req, res) => {
  const docId = req.params.id;  // aquí 'ofertas'

  try {
    const doc = await db.collection('informacionQR').doc(docId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    return res.json(doc.data());
  } catch (error) {
    console.error('Error al obtener documento:', error);
    return res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

//-----------------------------------------------------------------------------------------
//--GRAFICA--------------------------------------------------------------------------------

// Endpoint para obtener los montos de préstamo
app.get('/api/montos', async (req, res) => {
  try {
    const snapshot = await db.collection('s-credito').get();
    const montos = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.montoPrestamo) {
        // Convertirlo a número si está en string
        montos.push(Number(data.montoPrestamo));
      }
    });

    res.status(200).json(montos);
  } catch (error) {
    console.error("Error al obtener montos:", error);
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

// 6. Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor unificado corriendo en el puerto ${port}`);
});
