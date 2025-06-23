const express = require("express");
const cors = require("cors"); // <--- agregar esto

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// firebase admin
var admin = require("firebase-admin");
var serviceAccount = require("./claveFireBase/prueba-1-9c56c-firebase-adminsdk-fbsvc-3b54d9d445.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://prueba-1-9c56c-default-rtdb.firebaseio.com"
});

const db = admin.firestore();

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

//---------------------------QR----------------------------------------------------------------------------
// Ruta GET para obtener documento por id -> servicios ----------------------------------------------------
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
