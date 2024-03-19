const express = require('express');
const http = require('http');
const dgram = require('dgram');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const moment = require('moment');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const port = 80;
const udpPort = 7002;

const dbConfig = {
  host: 'database-1.c9ycgu6g4n48.us-east-1.rds.amazonaws.com',
  user: 'admin',
  password: 'loco1515',
  database: 'mensajes',
  port: 3306,
};

const connection = mysql.createConnection(dbConfig);

connection.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    return;
  }

  // Verificar si la tabla existe, y crearla si no
  const checkTableQuery = "SHOW TABLES LIKE 'coordenadas'";
  connection.query(checkTableQuery, (err, results) => {
    if (err) {
      console.error('Error al verificar la existencia de la tabla:', err);
      connection.end();
      return;
    }

    if (results.length === 0) {
      // La tabla no existe, crearla
      const createTableQuery = `
        CREATE TABLE coordenadas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          fecha TIMESTAMP,
          latitud DOUBLE PRECISION,
          longitud DOUBLE PRECISION,
          altitud DOUBLE PRECISION
        )
      `;
      connection.query(createTableQuery, (err) => {
        if (err) {
          console.error('Error al crear la tabla:', err);
          connection.end();
          return;
        }

        console.log('Tabla "coordenadas" creada con éxito');
      });
    }
  });
});

const udpServer = dgram.createSocket('udp4');

udpServer.on('message', async (msg, rinfo) => {
  const messageString = msg.toString();

  const match = messageString.match(/FH: (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}) Lat: (\d+\.\d+) Lon: (-?\d+\.\d+) Alt: (-?\d+\.\d+)/);

  if (match) {
    const fechaString = match[1];
    const fecha = moment(fechaString, 'DD/MM/YYYY HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
    const latitud = parseFloat(match[2]);
    const longitud = parseFloat(match[3]);
    const altitud = parseFloat(match[4]);

    // Guardar datos en la base de datos MySQL
    const insertQuery = 'INSERT INTO coordenadas (fecha, latitud, longitud, altitud) VALUES (?, ?, ?, ?)';
    connection.query(insertQuery, [fecha, latitud, longitud, altitud], (err, results) => {
      if (err) {
        console.error('Error al insertar datos en la base de datos:', err);
        return;
      }

      console.log('Datos insertados en la base de datos MySQL');
    });

    // Enviar datos a todos los clientes WebSocket conectados
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ fecha, latitud, longitud, altitud }));
      }
    });

    console.log('Datos enviados a clientes WebSocket:', { fecha, latitud, longitud, altitud });
  } else {
    console.error('Mensaje UDP no tiene el formato esperado:', messageString);
  }
});

udpServer.bind(udpPort, () => {
  console.log('Servidor UDP escuchando en el puerto 7002');
});

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(port, (port) => {
  console.log('Servidor web en http://54.221.22.143: ${port}');
});
