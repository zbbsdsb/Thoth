import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // R2 Configuration
  const r2Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Get Presigned URL for R2 Upload
  app.post("/api/r2/presign", async (req, res) => {
    try {
      const { fileName, contentType } = req.body;
      
      if (!process.env.R2_BUCKET_NAME) {
        return res.status(500).json({ error: "R2_BUCKET_NAME not configured" });
      }

      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: fileName,
        ContentType: contentType,
      });

      const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
      
      const publicUrl = process.env.R2_PUBLIC_URL 
        ? `${process.env.R2_PUBLIC_URL}/${fileName}`
        : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${fileName}`;

      res.json({ signedUrl, publicUrl });
    } catch (error: any) {
      console.error("R2 Presign Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
