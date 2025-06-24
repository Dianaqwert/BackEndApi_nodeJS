// server.js

// 1. Importaciones y configuración inicial
require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const admin = require('firebase-admin');

// --- IMPORTANTE: Asegúrate de que la ruta al archivo de credenciales es correcta ---
// Utiliza la ruta del segundo script o ajústala a tu estructura de proyecto.
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : require('./serviceAccountKey.json');
const app = express();
const port = process.env.PORT || 3000;

// 2. Inicializar Firebase Admin SDK
// Se combina la configuración de ambos scripts.
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Es una buena práctica incluir el databaseURL si usas Realtime Database, aunque no parezca usarse en los endpoints.
  databaseURL: "https://prueba-1-9c56c-default-rtdb.firebaseio.com"
});

// Se obtienen las instancias de los servicios de Firebase
const db = admin.firestore();
const auth = admin.auth();

// 3. Middlewares
app.use(cors()); // Permite peticiones desde orígenes cruzados (frontend)
app.use(express.json()); // Permite al servidor entender el body de las peticiones en formato JSON
app.use(express.urlencoded({ extended: false })); // Middleware del segundo script, útil para formularios HTML.

// 4. Configuración de Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Tu email de Gmail desde .env
    pass: process.env.EMAIL_PASS, // Tu contraseña de aplicación de Gmail desde .env
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
      console.log(`Intento de recuperación para usuario no existente: ${username}`);
      return res.status(200).json({ message: 'Si el usuario existe, se ha enviado un correo de recuperación.' });
    }

    const userData = snapshot.docs[0].data();
    const userEmail = userData.email;

    if (!userEmail) {
      return res.status(500).json({ message: 'El usuario encontrado no tiene un email asociado.' });
    }

    // --- IMPORTANTE: Actualiza el link para que apunte a tu frontend de producción o desarrollo ---
    const recoveryLink = `http://localhost:4200/cambiar-contrasena/${userEmail}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: 'Recuperación de Contraseña',
      html: `
        <h1>Recupera tu acceso</h1>
        <p>Hola ${username},</p>
        <p>Hemos recibido una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
        <a href="${recoveryLink}" style="padding: 10px 15px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">Restablecer Contraseña</a>
        <p>Si no solicitaste esto, puedes ignorar este correo.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Correo de recuperación enviado a: ${userEmail}`);
    res.status(200).json({ message: 'Si el usuario existe, se ha enviado un correo de recuperación.' });

  } catch (error) {
    console.error('Error al enviar el correo de recuperación:', error);
    res.status(500).json({ message: 'Ocurrió un error en el servidor.' });
  }
});

// --- ENDPOINT PARA CAMBIAR CONTRASEÑA Y DESBLOQUEAR ---
app.post('/cambiar-contrasena', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'El email y la nueva contraseña son requeridos.' });
  }

  try {
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;

    await auth.updateUser(uid, {
      password: newPassword,
    });

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

// --- ENDPOINT PARA OBTENER INFO DE QR POR ID ---
app.get('/api/informacionQR/:id', async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = await db.collection('informacionQR').doc(docId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    return res.json(doc.data());
  } catch (error) {
    console.error('Error al obtener documento QR:', error);
    return res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

// --- ENDPOINT PARA OBTENER MONTOS DE PRÉSTAMO PARA GRÁFICA ---
app.get('/api/montos', async (req, res) => {
  try {
    const snapshot = await db.collection('s-credito').get();
    const montos = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.montoPrestamo) {
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
  console.log(`Servidor unificado corriendo en http://localhost:${port}`);
});