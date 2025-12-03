// models/CompanyProfile.js
import mongoose from "mongoose";

const companyProfileSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    companyName: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      minlength: [2, "Company name must be at least 2 characters"],
      maxlength: [100, "Company name must not exceed 100 characters"],
    },
    tagline: {
      type: String,
      default: "",
      trim: true,
      maxlength: [150, "Tagline must not exceed 150 characters"],
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return false;
          return /^\+?[1-9]\d{9,14}$/.test(v);
        },
        message: 'Please enter a valid international phone number (e.g., +1234567890)',
      },
    },
    companyAddress: {
      type: String,
      required: true,
      trim: true,
    },
    website: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          return /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/.test(
            v
          );
        },
        message: "Please enter a valid website URL",
      },
    },
  // Default company logo path; put a PNG at uploads/defaults/companyprofile.png
  logo: { type: String, default: "/uploads/defaults/companyprofile.png" },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [2000, "Description must not exceed 2000 characters"],
    },
    industry: {
      type: String,
      default: "",
      trim: true,
    },
    headquarters: {
      type: String,
      default: "",
      trim: true,
      maxlength: [100, "Headquarters must not exceed 100 characters"],
    },
    companyType: {
      type: String,
      default: "",
      enum: {
        values: ["", "Public", "Private", "Non-Profit", "Government"],
        message: "{VALUE} is not a valid company type",
      },
    },
    companySize: {
      type: String,
      default: "",
      enum: {
        values: [
          "",
          "1-10 employees",
          "11-50 employees",
          "51-200 employees",
          "201-500 employees",
          "501-1000 employees",
          "1001+ employees",
        ],
        message: "{VALUE} is not a valid company size",
      },
    },
    founded: {
      type: String,
      default: "",
      trim: true,
      validate: {
        validator: function (v) {
          if (!v) return true;
          if (!/^\d{4}$/.test(v)) return false;
          const year = parseInt(v);
          const currentYear = new Date().getFullYear();
          return year >= 1800 && year <= currentYear;
        },
        message:
          "Founded year must be a valid 4-digit year between 1800 and current year",
      },
    },
    specialties: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr) {
          return arr.every((s) => typeof s === "string" && s.trim().length > 0);
        },
        message: "Each specialty must be a non-empty string",
      },
    },
    mission: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "Mission must not exceed 1000 characters"],
    },
    vision: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "Vision must not exceed 1000 characters"],
    },
  },
  { timestamps: true }
);

// Useful indexes
companyProfileSchema.index({ company: 1 }, { unique: true });
companyProfileSchema.index({ companyName: 1 });
companyProfileSchema.index({ industry: 1 });

// Pre-save middleware to trim and sanitize all string fields
companyProfileSchema.pre("save", function (next) {
  // Trim all string fields and remove extra whitespace
  const stringFields = [
    "companyName",
    "tagline",
    "phone",
    "companyAddress",
    "website",
    "description",
    "industry",
    "headquarters",
    "mission",
    "vision",
  ];
  stringFields.forEach((field) => {
    if (this[field] && typeof this[field] === "string") {
      this[field] = this[field].trim().replace(/\s+/g, " ");
    }
  });
  // Trim specialties array items
  if (Array.isArray(this.specialties)) {
    this.specialties = this.specialties
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  next();
});

export default mongoose.model("CompanyProfile", companyProfileSchema);
