import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    jobTitle: {
      type: String,
      required: [true, "Job title is required"],
      trim: true,
      minlength: [3, "Job title must be at least 3 characters"],
      maxlength: [100, "Job title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Job description is required"],
      trim: true,
      minlength: [30, "Description must be at least 30 characters"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    jobType: {
      type: String,
      required: [true, "Job type is required"],
      enum: {
        values: [
          "Full-time",
          "Part-time",
          "Contract",
          "Internship",
          "Temporary",
        ],
        message:
          "Job type must be one of: Full-time, Part-time, Contract, Internship, Temporary",
      },
    },
    location: {
      type: String,
      required: [true, "Job location is required"],
      trim: true,
    },
    salary: {
      min: {
        type: Number,
        min: [0, "Minimum salary cannot be negative"],
      },
      max: {
        type: Number,
        min: [0, "Maximum salary cannot be negative"],
      },
      currency: {
        type: String,
        default: "USD",
        uppercase: true,
        trim: true,
      },
    },
    salaryType: {
      type: String,
      enum: {
        values: ["range", "exact", "negotiable"],
        message: "Salary type must be one of: range, exact, negotiable",
      },
      default: "range",
    },
    payPeriod: {
      type: String,
      enum: {
        values: ["year", "month", "hour", "day"],
        message: "Pay period must be one of: year, month, hour, day",
      },
      default: "year",
    },
    salaryNormalizedAnnual: {
      type: Number,
      index: true,
      min: 0,
    },
    skills: {
      type: [String],
      default: [],
      validate: {
        validator: function (skills) {
          // Limit the number of skills to a maximum of 10
          return skills.length <= 10;
        },
        message: "You can specify up to 10 skills only.",
      },
    },
    experienceLevel: {
      type: String,
      enum: {
        values: ["Entry-level", "Mid-level", "Senior", "Executive"],
        message:
          "Experience level must be one of: Entry-level, Mid-level, Senior, Executive",
      },
    },
    applicationDeadline: {
      type: Date,
      validate: {
        validator: function (value) {
          // Ensure the deadline is in the future
          return value > Date.now();
        },
        message: "Application deadline must be a future date.",
      },
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company", // Stores the Company _id
      required: [true, "Company ID is required"],
    },
    contactEmail: {
      type: String,
      required: [true, "Contact email is required"],
      trim: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Please use a valid email address."],
    },
    benefits: {
      type: [String],
      default: [],
      validate: {
        validator: function(values) {
          return values.every(val => val.length <= 2000);
        },
        message: 'Each benefit item cannot exceed 2000 characters'
      }
    },
    responsibilities: {
      type: [String],
      default: [],
      validate: {
        validator: function(values) {
          return values.every(val => val.length <= 3000);
        },
        message: 'Each responsibility item cannot exceed 3000 characters'
      }
    },
    qualifications: {
      type: [String],
      default: [],
      validate: {
        validator: function(values) {
          return values.every(val => val.length <= 3000);
        },
        message: 'Each qualification item cannot exceed 3000 characters'
      }
    },
    remoteOption: {
      type: Boolean,
      default: false,
    },
    industry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Industry",
      required: [true, "Industry is required"],
    },
    status: {
      type: String,
      enum: {
        values: ["Open", "Closed"],
        message: "Status must be either Open or Closed",
      },
      default: "Open",
    },
    featured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Adding compound indexes for efficient search on common query patterns (only if not already defined)
if (!jobSchema.indexes().some(index => index[0] && index[0].status && index[0].industry && index[0].createdAt)) {
  jobSchema.index({ status: 1, industry: 1, createdAt: -1 }); // For filtered jobs by status and industry
}
if (!jobSchema.indexes().some(index => index[0] && index[0].companyId && index[0].status)) {
  jobSchema.index({ companyId: 1, status: 1 }); // For company-specific job listings
}
if (!jobSchema.indexes().some(index => index[0] && index[0].location && index[0].jobType)) {
  jobSchema.index({ location: 1, jobType: 1 }); // For location and type-based searches
}
if (!jobSchema.indexes().some(index => index[0] && index[0].applicationDeadline && index[0].status)) {
  jobSchema.index({ applicationDeadline: 1, status: 1 }); // For deadline-based filtering
}
// Text search for title and description
jobSchema.index({ jobTitle: "text", description: "text" });
// Useful additional indexes
jobSchema.index({ skills: 1 });
jobSchema.index({ createdAt: -1 });

// Virtual: companyProfile links to the CompanyProfile document whose "company" field matches job.companyId
jobSchema.virtual("companyProfile", {
  ref: "CompanyProfile",
  localField: "companyId",
  foreignField: "company",
  justOne: true,
});

// Cascade delete: Remove all related data when a job is deleted
jobSchema.pre('findOneAndDelete', async function(next) {
  try {
    const jobId = this.getQuery()._id;
    
    const Application = mongoose.model('Application');
    const SavedJob = mongoose.model('SavedJob');
    const Interview = mongoose.model('Interview');
    
    // Delete all applications for this job
    await Application.deleteMany({ jobId: jobId });
    
    // Delete all saved job entries
    await SavedJob.deleteMany({ jobId: jobId });
    
    // Delete all interviews for this job
    await Interview.deleteMany({ jobId: jobId });
    
    console.log(`✅ Cascade delete completed for Job: ${jobId}`);
    next();
  } catch (error) {
    console.error('Error in Job cascade delete:', error);
    next(error);
  }
});

jobSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  try {
    const jobId = this._id;
    
    const Application = mongoose.model('Application');
    const SavedJob = mongoose.model('SavedJob');
    const Interview = mongoose.model('Interview');
    
    await Application.deleteMany({ jobId: jobId });
    await SavedJob.deleteMany({ jobId: jobId });
    await Interview.deleteMany({ jobId: jobId });
    
    console.log(`✅ Cascade delete completed for Job: ${jobId}`);
    next();
  } catch (error) {
    console.error('Error in Job cascade delete:', error);
    next(error);
  }
});

const Job = mongoose.model("Job", jobSchema);

export default Job;
