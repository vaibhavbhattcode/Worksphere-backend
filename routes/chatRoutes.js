// routes/chatRoutes.js
import express from "express";
import { resolveActor } from "../middleware/actorMiddleware.js";
import { listConversations, startConversation, listMessages, sendMessage, markRead, presence } from "../controllers/chatController.js";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";

const router = express.Router();

router.use(resolveActor);

const sendLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });

// Multer setup for chat attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join("uploads", "chat")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `chat-${Date.now()}${ext}`);
  },
});
const allowedMimes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/zip",
  "text/plain",
]);
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (allowedMimes.has(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed"));
  },
});

router.get("/conversations", listConversations);
router.post("/start", startConversation);
router.get("/:conversationId/messages", listMessages);
router.post("/:conversationId/messages", sendLimiter, upload.single("file"), sendMessage);
router.post("/:conversationId/read", markRead);
router.get("/presence/:type/:id", presence);

export default router;


