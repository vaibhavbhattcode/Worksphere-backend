// models/UserProfile.js
import mongoose from "mongoose";

const userProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
  // Default profile image stored under uploads/defaults; ensure the file exists.
  profileImage: { type: String, default: "/uploads/defaults/userprofile.jpg" },
    title: { type: String, default: "" },
    location: { type: String, default: "" },
    phone: {
      type: String,
      default: "",
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^\+?[1-9]\d{6,14}$/.test(v);
        },
        message: 'Please enter a valid international phone number (e.g., +1234567890)',
      },
    },
    about: { type: String, default: "" },
    // Changed from an array of strings to an array of Skill references
    skills: [{ type: mongoose.Schema.Types.ObjectId, ref: "Skill" }],
    socialLinks: {
      linkedin: { type: String, default: "" },
      github: { type: String, default: "" },
      twitter: { type: String, default: "" },
      portfolio: { type: String, default: "" },
    },
    profileViews: { type: Number, default: 0 },
    interactions: { type: Number, default: 0 },
    viewsOverTime: { type: Array, default: [] },
    jobMatchRank: { type: Number, default: 0 },
    resume: { type: String, default: "" },
    resumeName: { type: String, default: "" },
    videoIntroduction: { type: String, default: "" },
    resumePreferences: {
      activeSource: {
        type: String,
        enum: ["uploaded", "builder"],
        default: "builder",
      },
      uploaded: {
        path: { type: String, default: "" },
        name: { type: String, default: "" },
        lastUpdated: { type: Date, default: null },
      },
      builder: {
        path: { type: String, default: "" },
        name: { type: String, default: "" },
        lastGenerated: { type: Date, default: null },
      },
    },
    resumeBuilder: {
      templateId: { type: Number, default: 1 },
      personalInfo: {
        name: { type: String, default: "" },
        title: { type: String, default: "" },
        location: { type: String, default: "" },
        email: { type: String, default: "" },
        phone: { type: String, default: "" },
        about: { type: String, default: "" },
      },
      education: [
        {
          institution: { type: String, default: "" },
          degree: { type: String, default: "" },
          fieldOfStudy: { type: String, default: "" },
          startDate: { type: String, default: "" },
          endDate: { type: String, default: "" },
          grade: { type: String, default: "" },
          description: { type: String, default: "" },
        },
      ],
      experience: [
        {
          position: { type: String, default: "" },
          company: { type: String, default: "" },
          startDate: { type: String, default: "" },
          endDate: { type: String, default: "" },
          description: { type: String, default: "" },
        },
      ],
      projects: [
        {
          title: { type: String, default: "" },
          description: { type: String, default: "" },
          technologies: { type: String, default: "" },
          url: { type: String, default: "" },
        },
      ],
      skills: [{ type: String, default: "" }],
      lastUpdated: { type: Date },
      generatedPdfPath: { type: String, default: "" },
      generatedPdfName: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

// Useful indexes
userProfileSchema.index({ user: 1 }, { unique: true });
userProfileSchema.index({ name: 1 });
userProfileSchema.index({ title: 1 });

export default mongoose.model("UserProfile", userProfileSchema);
