// models/Education.js
import mongoose from "mongoose";

const educationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    institution: { type: String },
    degree: { type: String },
    year: { type: String },
  },
  { timestamps: true }
);

educationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Education", educationSchema);
