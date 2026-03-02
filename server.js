// server.js
const express = require("express");
const { Pool } = require("pg");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

// Conexión a Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Carpeta temporal para HLS
const HLS_DIR = path.join(__dirname, "hls");
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR);

// Crear canal
app.post("/channel", async (req, res) => {
  const { name, sourceUrl, logoUrl } = req.body;

  if (!name || !sourceUrl || !logoUrl) {
    return res.status(400).json({ error: "Faltan campos" });
  }

  try {
    // Guardar en Neon
    await pool.query(
      "INSERT INTO channels(name, source_url, logo_url) VALUES($1, $2, $3) ON CONFLICT (name) DO NOTHING",
      [name, sourceUrl, logoUrl]
    );

    // Directorio del canal
    const channelDir = path.join(HLS_DIR, name);
    if (!fs.existsSync(channelDir)) fs.mkdirSync(channelDir);

    // Archivo de salida HLS
    const output = path.join(channelDir, "index.m3u8");

    // Ejecutar FFmpeg para generar HLS con logo
    const ffmpeg = spawn("ffmpeg", [
      "-i", sourceUrl,
      "-vf", `movie=${logoUrl} [logo]; [in][logo] overlay=W-w-10:10 [out]`,
      "-c:a", "copy",
      "-f", "hls",
      "-hls_time", "6",
      "-hls_list_size", "5",
      "-hls_flags", "delete_segments",
      output
    ]);

    ffmpeg.stderr.on("data", data => console.log(`FFmpeg: ${data}`));
    ffmpeg.on("close", code => {
      if (code !== 0) console.log(`FFmpeg salió con código ${code}`);
    });

    // URL HTTPS final
    const url = `https://${req.headers.host}/live/${name}.m3u8`;
    res.json({ message: "Canal creado", url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creando canal" });
  }
});

// Servir los streams
app.use("/live", express.static(HLS_DIR));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor multicanal iniciado en puerto ${PORT}`));
