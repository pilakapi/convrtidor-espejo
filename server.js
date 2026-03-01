const express = require("express");
const { Pool } = require("pg");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const processes = {};

// Crear canal
app.post("/channel", async (req, res) => {
  const { name, sourceUrl, logoUrl } = req.body;

  if (!name || !sourceUrl || !logoUrl)
    return res.json({ error: "Faltan datos" });

  const outputDir = `streams/${name}`;
  fs.mkdirSync(outputDir, { recursive: true });

  const outputM3U8 = `${outputDir}/index.m3u8`;

  await pool.query(
    "INSERT INTO channels (name, source_url, logo_url, output_path) VALUES ($1,$2,$3,$4)",
    [name, sourceUrl, logoUrl, outputM3U8]
  );

  startStream(name, sourceUrl, logoUrl, outputM3U8);

  res.json({
    message: "Canal creado",
    url: `${req.protocol}://${req.get("host")}/live/${name}.m3u8`
  });
});

// Iniciar FFmpeg
function startStream(name, sourceUrl, logoUrl, output) {

  const ffmpeg = spawn("ffmpeg", [
    "-i", sourceUrl,
    "-i", logoUrl,
    "-filter_complex", "overlay=W-w-20:20",
    "-c:a", "copy",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-b:v", "1500k",
    "-f", "hls",
    "-hls_time", "4",
    "-hls_list_size", "6",
    "-hls_flags", "delete_segments",
    output
  ]);

  processes[name] = ffmpeg;

  ffmpeg.on("close", () => {
    console.log(`Stream ${name} detenido`);
  });
}

// Servir canal
app.get("/live/:name.m3u8", (req, res) => {
  const file = path.join(__dirname, "streams", req.params.name, "index.m3u8");
  res.sendFile(file);
});

// Servir segmentos
app.use("/streams", express.static("streams"));

app.listen(PORT, () => {
  console.log("Servidor multi-canal iniciado");
});