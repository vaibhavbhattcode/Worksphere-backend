import mongoose from "mongoose";
const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  timestamp: { type: Date, default: Date.now },
  details: { type: Object },
});

auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
