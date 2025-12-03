import mongoose from "mongoose";

const interviewSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job",
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Application",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  jitsiRoomId: {
    type: String,
    required: true,
    unique: true,
  },
  notes: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["scheduled", "rescheduled", "cancelled", "completed"],
    default: "scheduled",
  },
  reminderSent: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

interviewSchema.index({ jobId: 1, date: -1 });
interviewSchema.index({ userId: 1, date: -1 });
interviewSchema.index({ applicationId: 1 });
interviewSchema.index({ status: 1 });

export default mongoose.model("Interview", interviewSchema);
