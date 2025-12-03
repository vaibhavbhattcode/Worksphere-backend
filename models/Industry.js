// models/Industry.js
import mongoose from "mongoose";

const industrySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Industry name is required"],
      unique: true,
      trim: true,
      minlength: [2, "Industry name must be at least 2 characters"],
      maxlength: [50, "Industry name cannot exceed 50 characters"],
    },
    slug: {
      type: String,
      unique: true,
      sparse: true, // Allow null values but ensure uniqueness when present
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"],
    },
    icon: {
      type: String,
      trim: true,
      default: "briefcase",
    },
    gradient: {
      type: String,
      trim: true,
      default: "from-gray-500 to-gray-400",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Create indexes (only if not already defined)
if (!industrySchema.indexes().some(index => index[0] && index[0].name)) {
  industrySchema.index({ name: 1 });
}
if (!industrySchema.indexes().some(index => index[0] && index[0].isActive && index[0].displayOrder)) {
  industrySchema.index({ isActive: 1, displayOrder: 1 });
}
if (!industrySchema.indexes().some(index => index[0] && index[0].slug)) {
  industrySchema.index({ slug: 1 });
}

// Pre-save middleware to generate slug from name
industrySchema.pre("save", function (next) {
  if (this.isModified("name") && this.name) {
    // Generate slug from name
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single
      .trim();
  }

  if (this.isModified()) {
    // You can add logic here to set updatedBy from the current user context
    // For now, we'll leave it as is
  }
  next();
});

// Virtual to get job count for this industry
industrySchema.virtual("jobCount", {
  ref: "Job",
  localField: "_id",
  foreignField: "industry",
  count: true,
  match: { status: "Open" },
});

// Virtual to get all jobs for this industry
industrySchema.virtual("jobs", {
  ref: "Job",
  localField: "_id",
  foreignField: "industry",
  match: { status: "Open" },
});

const Industry = mongoose.model("Industry", industrySchema);

export default Industry;