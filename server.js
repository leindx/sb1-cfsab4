const express = require('express');
const sql = require('mssql');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = 3000;

// Configuración de la conexión a SQL Server
const config = {
  user: 'sa',
  password: '89709061',
  server: 'localhost\\FISHTALK',
  database: 'AkvaLicenseDB',
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

// Conectar a la base de datos SQL Server
sql.connect(config).then(() => {
  console.log('Conectado a la base de datos SQL Server.');
}).catch(err => {
  console.error('Error al conectar a SQL Server:', err);
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Ruta para obtener todos los clientes con detalles completos
app.get('/api/clientes', async (req, res) => {
  try {
    const result = await sql.query`
      SELECT 
        ClienteID,
        NombreCliente,
        CASE 
          WHEN FechaExpiracionLicencia = '1900-01-01' THEN NULL 
          ELSE FORMAT(FechaExpiracionLicencia, 'dd-MM-yyyy') 
        END as FechaExpiracionLicencia,
        VersionAnalytics,
        VersionConnector,
        VersionAdapter,
        CASE 
          WHEN FechaActualizacion = '1900-01-01' THEN NULL 
          ELSE FORMAT(FechaActualizacion, 'dd-MM-yyyy') 
        END as FechaActualizacion
      FROM Clientes
    `;
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({"error": err.message});
  }
});

// Ruta para obtener los centros de un cliente
app.get('/api/centros/:clienteId', async (req, res) => {
  try {
    let query = `
      SELECT 
        c.CentroID,
        c.ClienteID,
        cl.NombreCliente,
        c.NombreCentro,
        c.NombrePonton,
        c.SistemaID,
        sa.NombreSistema,
        c.VersionSistema,
        FORMAT(c.FechaInstalacionACA, 'yyyy-MM-dd') as FechaInstalacionACA,
        FORMAT(c.FechaTermino, 'yyyy-MM-dd') as FechaTermino
      FROM Centros c
      JOIN SistemasAlimentacion sa ON c.SistemaID = sa.SistemaID
      JOIN Clientes cl ON c.ClienteID = cl.ClienteID
    `;
    
    if (req.params.clienteId !== 'todos') {
      query += ` WHERE c.ClienteID = ${req.params.clienteId}`;
    }
    
    const result = await sql.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error al obtener centros:', err);
    res.status(500).json({"error": err.message});
  }
});

// Ruta para añadir un nuevo cliente
app.post('/api/clientes', async (req, res) => {
  const { 
    NombreCliente, 
    FechaExpiracionLicencia,
    VersionAnalytics,
    VersionConnector,
    VersionAdapter,
    FechaActualizacion
  } = req.body;
  
  try {
    const clienteExistente = await sql.query`
      SELECT * FROM Clientes WHERE NombreCliente = ${NombreCliente}
    `;
    
    if (clienteExistente.recordset.length > 0) {
      return res.status(400).json({"error": "Ya existe un cliente con ese nombre"});
    }

    const result = await sql.query`
      INSERT INTO Clientes (
        NombreCliente, 
        FechaExpiracionLicencia,
        VersionAnalytics,
        VersionConnector,
        VersionAdapter,
        FechaActualizacion
      )
      VALUES (
        ${NombreCliente},
        ${FechaExpiracionLicencia || null},
        ${VersionAnalytics},
        ${VersionConnector},
        ${VersionAdapter},
        ${FechaActualizacion || null}
      );
      SELECT SCOPE_IDENTITY() AS ClienteID;
    `;
    
    res.json({
      "success": true,
      "message": "Cliente añadido con éxito",
      "clienteId": result.recordset[0].ClienteID
    });
  } catch (err) {
    res.status(500).json({"error": err.message});
  }
});

// Ruta para actualizar un cliente
app.put('/api/clientes/:clienteId', async (req, res) => {
  const { 
    NombreCliente, 
    FechaExpiracionLicencia,
    VersionAnalytics,
    VersionConnector,
    VersionAdapter,
    FechaActualizacion
  } = req.body;
  
  try {
    await sql.query`
      UPDATE Clientes
      SET 
        NombreCliente = ${NombreCliente},
        FechaExpiracionLicencia = ${FechaExpiracionLicencia || null},
        VersionAnalytics = ${VersionAnalytics},
        VersionConnector = ${VersionConnector},
        VersionAdapter = ${VersionAdapter},
        FechaActualizacion = ${FechaActualizacion || null}
      WHERE ClienteID = ${req.params.clienteId}
    `;
    
    res.json({ success: true, message: "Cliente actualizado con éxito" });
  } catch (err) {
    res.status(500).json({"error": err.message});
  }
});

// Ruta para añadir un nuevo centro
app.post('/api/centros', async (req, res) => {
  const { ClienteID, NombreCentro, NombrePonton, SistemaID, VersionSistema, FechaInstalacionACA, FechaTermino } = req.body;
  try {
    // Verificar si el centro ya existe para ese cliente
    const centroExistente = await sql.query`
      SELECT * FROM Centros 
      WHERE ClienteID = ${ClienteID} AND NombreCentro = ${NombreCentro}
    `;
    if (centroExistente.recordset.length > 0) {
      return res.status(400).json({"error": "Ya existe un centro con ese nombre para este cliente"});
    }

    const result = await sql.query`
      INSERT INTO Centros (ClienteID, NombreCentro, NombrePonton, SistemaID, VersionSistema, FechaInstalacionACA, FechaTermino)
      OUTPUT INSERTED.CentroID
      VALUES (${ClienteID}, ${NombreCentro}, ${NombrePonton}, ${SistemaID}, ${VersionSistema}, ${FechaInstalacionACA || null}, ${FechaTermino || null})
    `;
    res.json({ 
      success: true,
      message: "Centro añadido con éxito",
      CentroID: result.recordset[0].CentroID, 
      ...req.body 
    });
  } catch (err) {
    console.error('Error al añadir centro:', err);
    res.status(500).json({"error": err.message});
  }
});

// Ruta para actualizar un centro
app.put('/api/centros/:centroId', async (req, res) => {
  const { NombreCentro, NombrePonton, SistemaID, VersionSistema, FechaInstalacionACA, FechaTermino } = req.body;
  try {
    await sql.query`
      UPDATE Centros
      SET NombreCentro = ${NombreCentro},
          NombrePonton = ${NombrePonton},
          SistemaID = ${SistemaID},
          VersionSistema = ${VersionSistema},
          FechaInstalacionACA = ${FechaInstalacionACA || null},
          FechaTermino = ${FechaTermino || null}
      WHERE CentroID = ${req.params.centroId}
    `;
    res.json({ success: true, message: "Centro actualizado con éxito" });
  } catch (err) {
    console.error('Error al actualizar centro:', err);
    res.status(500).json({"error": err.message});
  }
});

// Ruta para obtener el estado mensual de los centros
app.get('/api/estado-mensual', async (req, res) => {
  const { clienteId, año, mes } = req.query;
  try {
    let query = `
      SELECT c.*, sa.NombreSistema, emc.EstadoID, emc.CentroConAnalytics, emc.Comentarios,
             emc.SistemaID as SistemaIDMensual, emc.VersionSistema as VersionSistemaMensual
      FROM Centros c
      LEFT JOIN EstadoMensualCentros emc ON c.CentroID = emc.CentroID AND emc.Año = ${año} AND emc.Mes = ${mes}
      LEFT JOIN SistemasAlimentacion sa ON ISNULL(emc.SistemaID, c.SistemaID) = sa.SistemaID
      WHERE c.FechaInstalacionACA <= EOMONTH(DATEFROMPARTS(${año}, ${mes}, 1))
        AND (c.FechaTermino IS NULL OR c.FechaTermino >= DATEFROMPARTS(${año}, ${mes}, 1))
    `;

    if (clienteId !== 'todos') {
      query += ` AND c.ClienteID = ${clienteId}`;
    }

    const result = await sql.query(query);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error al obtener estado mensual:', err);
    res.status(500).json({"error": err.message});
  }
});

// Ruta para actualizar o insertar el estado mensual de un centro
app.post('/api/estado-mensual', async (req, res) => {
  const estados = req.body;
  try {
    for (const estado of estados) {
      await sql.query`
        MERGE INTO EstadoMensualCentros AS target
        USING (VALUES (
          ${estado.CentroID}, 
          ${estado.Año}, 
          ${estado.Mes}, 
          ${estado.EstadoID}, 
          ${estado.CentroConAnalytics}, 
          ${estado.Comentarios},
          ${estado.SistemaID},
          ${estado.VersionSistema}
        ))
        AS source (
          CentroID, 
          Año, 
          Mes, 
          EstadoID, 
          CentroConAnalytics, 
          Comentarios,
          SistemaID,
          VersionSistema
        )
        ON target.CentroID = source.CentroID AND target.Año = source.Año AND target.Mes = source.Mes
        WHEN MATCHED THEN
          UPDATE SET
            EstadoID = source.EstadoID,
            CentroConAnalytics = source.CentroConAnalytics,
            Comentarios = source.Comentarios,
            SistemaID = source.SistemaID,
            VersionSistema = source.VersionSistema
        WHEN NOT MATCHED THEN
          INSERT (
            CentroID, 
            Año, 
            Mes, 
            EstadoID, 
            CentroConAnalytics, 
            Comentarios,
            SistemaID,
            VersionSistema
          )
          VALUES (
            source.CentroID,
            source.Año,
            source.Mes,
            source.EstadoID,
            source.CentroConAnalytics,
            source.Comentarios,
            source.SistemaID,
            source.VersionSistema
          );
      `;
    }
    res.json({ success: true, message: "Estados mensuales actualizados con éxito" });
  } catch (err) {
    console.error('Error al actualizar estados mensuales:', err);
    res.status(500).json({"error": err.message});
  }
});

// Ruta para obtener los años disponibles
app.get('/api/años', async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM Años ORDER BY Año DESC`;
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error al obtener años:', err);
    res.status(500).json({"error": err.message});
  }
});

// Ruta para obtener los sistemas de alimentación
app.get('/api/sistemas-alimentacion', async (req, res) => {
  try {
    const result = await sql.query`SELECT * FROM SistemasAlimentacion`;
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error al obtener sistemas de alimentación:', err);
    res.status(500).json({"error": err.message});
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});