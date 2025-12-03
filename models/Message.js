// models/Message.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    senderType: { type: String, enum: ["user", "company"], required: true },
    senderUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    senderCompany: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
    text: { type: String, trim: true, maxlength: 4000 },
    attachments: [
      {
        url: String,
        type: { type: String, enum: ["image", "file"], default: "file" },
        name: String,
        size: Number
      }
    ],
    deliveredAt: { type: Date },
    readAt: { type: Date }
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: 1 }); // For fetching messages in conversation
messageSchema.index({ senderUser: 1, createdAt: -1 }); // For user's sent messages
messageSchema.index({ senderCompany: 1, createdAt: -1 }); // For company's sent messages
messageSchema.index({ conversation: 1, readAt: 1 }); // For unread messages

export default mongoose.model("Message", messageSchema);


