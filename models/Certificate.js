// models/Certificate.js
import mongoose from "mongoose";

const certificateSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

certificateSchema.index({ user: 1, uploadedAt: -1 });

export default mongoose.model("Certificate", certificateSchema);
