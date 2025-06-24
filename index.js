// server.js

// 1. Importaciones y configuración inicial
require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const admin = require('firebase-admin');

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : require('./serviceAccountKey.json');

const app = express();
// El puerto lo asignará Render automáticamente a través de process.env.PORT
const port = process.env.PORT || 3000;

// 2. Inicializar Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://prueba-1-9c56c-default-rtdb.firebaseio.com"
});

const db = admin.firestore();
const auth = admin.auth();

// 3. Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 4. Configuración de Nodemailer Transporter
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

// --- ENDPOINT PARA CAMBIAR CONTRASEÑA Y DESBLOQUEAR ---
app.post('/cambiar-contrasena', async (req, res) => {
  const { email, newPassword } = req.body;
  console.log(req.body);
  if (!email || !newPassword) {
      return res.status(400).json({ message: 'El email y la nueva contraseña son requeridos.' });
  }

  try {
      // Paso 1: Obtener el UID del usuario usando su email con privilegios de Admin.
      const userRecord = await auth.getUserByEmail(email);
      const uid = userRecord.uid;

      // Paso 2: Actualizar la contraseña en Firebase AUTHENTICATION.
      await auth.updateUser(uid, {
          password: newPassword,
      });

      // Paso 3: Actualizar el campo 'blocked' a false en FIRESTORE.
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

// ... (Resto de tus endpoints)

// 6. Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor unificado corriendo en el puerto ${port}`);
});
