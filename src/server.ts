import express, { Request, Response } from "express";
import cors from "cors";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { format } from "date-fns";
import { UTCDate } from "@date-fns/utc";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = 4000;

app.use(cors()); // Permitir requests CORS

const baseHlsDir: string = path.join(__dirname, "../hls");

// Função para gerar o caminho do diretório baseado na data atual em UTC
function getDailyDirectory(): string {
  const utcDate: Date = new UTCDate(); // Data atual em UTC
  const formattedDate: string = format(utcDate, "dd-MM-yyyy");
  return path.join(baseHlsDir, formattedDate);
}

// Função para iniciar o streaming
function startStreaming(): void {
  const dailyDir: string = getDailyDirectory();

  // Crie o diretório HLS por dia se não existir
  if (!fs.existsSync(dailyDir)) {
    fs.mkdirSync(dailyDir, { recursive: true });
  }

  const playlistPath: string = path.join(dailyDir, "cam1.m3u8");

  // Configure o FFmpeg para converter o fluxo RTSP em HLS
  console.log("Iniciando o streaming...", process.env.RTSP_URL!);
  ffmpeg(process.env.RTSP_URL!)
    .inputOptions(["-rtsp_transport", "tcp"])
    .outputOptions([
      "-f hls",
      "-hls_time 2", // Duração de cada segmento em segundos
      "-hls_list_size 0", // Número de segmentos na playlist
      "-hls_flags delete_segments", // Excluir segmentos antigos
    ])
    .output(playlistPath)
    .on("start", (commandLine: string) => {
      console.log("Comando FFmpeg iniciado:", commandLine);
    })
    .on("error", (err: Error) => {
      console.error("Erro no FFmpeg:", err);
    })
    .on("end", () => {
      console.log("Processo FFmpeg concluído");
    })
    .run();
}

// Rota para servir a playlist HLS
app.get("/hls/:day-:month-:year", (req: Request, res: Response): void => {
  const { year, month, day } = req.params;
  const { file } = req.query; 
  const filePath: string = path.join(
    baseHlsDir,
    `${day}-${month}-${year}`,
    `${file}.m3u8`
  );

  if (fs.existsSync(filePath)) {
    // Obtenha metadados do arquivo
    const fileStats = fs.statSync(filePath);

    res.json({
      name: file, // Nome do arquivo
      path: `http://localhost:${port}/hls/${day}-${month}-${year}/${file}.m3u8`, // Link completo para o arquivo
      size: fileStats.size, // Tamanho do arquivo em bytes
      createdAt: fileStats.birthtime, // Data de criação do arquivo
      isActive: true, // Um exemplo de status, pode ser personalizado
    });
  } else {
    res.status(404).json({ error: "Arquivo não encontrado" });
  }

});

app.get("/hls/:day-:month-:year/:file", (req: Request, res: Response): void => {
  const { year, month, day, file } = req.params;
  const filePath: string = path.join(
    baseHlsDir,
    `${day}-${month}-${year}`,
    `${file}`
  );

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "Arquivo não encontrado" });
  }
})

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor de vídeo rodando em http://localhost:${port}`);
  startStreaming(); // Inicia o streaming quando o servidor estiver rodando

  // Agendar a execução de `startStreaming` a cada 24 horas
  setInterval(() => {
    console.log("Reiniciando o streaming para criar um novo diretório...");
    startStreaming();
  }, 24 * 60 * 60 * 1000); // 24 horas em milissegundos
});
