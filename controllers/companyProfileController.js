// controllers/companyProfileController.js
import CompanyProfile from "../models/CompanyProfile.js";
import Job from "../models/Job.js"; // Ensure Job model is imported
import Joi from "joi";
import multer from "multer";
import path from "path";
import fs from "fs";

// Enhanced Joi schema with trimming and comprehensive validations
const trimString = Joi.string().trim().custom((value, helpers) => {
  if (value && value.trim().length === 0) {
    return helpers.error('string.notOnlySpaces');
  }
  return value;
});

const companyProfileSchema = Joi.object({
  companyName: trimString
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.min": "Company name must be at least 2 characters long",
      "string.max": "Company name must not exceed 100 characters",
      "any.required": "Company name is required",
      "string.notOnlySpaces": "Company name cannot be empty or contain only spaces",
    }),
  tagline: trimString
    .max(150)
    .allow("", null)
    .optional()
    .messages({
      "string.max": "Tagline must not exceed 150 characters",
    }),
  description: trimString
    .min(10)
    .max(2000)
    .allow("", null)
    .optional()
    .messages({
      "string.min": "Description must be at least 10 characters",
      "string.max": "Description must not exceed 2000 characters",
      "string.notOnlySpaces": "Description cannot be empty or contain only spaces",
    }),
  industry: trimString
    .required()
    .messages({
      "any.required": "Industry is required",
      "string.notOnlySpaces": "Industry cannot be empty",
    }),
  website: Joi.string()
    .trim()
    .uri()
    .pattern(/^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/)
    .allow("", null)
    .optional()
    .messages({
      "string.uri": "Please enter a valid URL (e.g., https://example.com)",
      "string.pattern.base": "Invalid website URL format",
    }),
  headquarters: trimString
    .min(2)
    .max(100)
    .allow("", null)
    .optional()
    .messages({
      "string.min": "Headquarters must be at least 2 characters",
      "string.max": "Headquarters must not exceed 100 characters",
    }),
  companyType: Joi.string()
    .valid("Public", "Private", "Non-Profit", "Government")
    .required()
    .messages({
      "any.required": "Company type is required",
      "any.only": "Please select a valid company type",
    }),
  companySize: Joi.string()
    .valid(
      "1-10 employees",
      "11-50 employees",
      "51-200 employees",
      "201-500 employees",
      "501-1000 employees",
      "1001+ employees"
    )
    .required()
    .messages({
      "any.required": "Company size is required",
      "any.only": "Please select a valid company size",
    }),
  founded: Joi.string()
    .trim()
    .pattern(/^\d{4}$/)
    .allow("", null)
    .optional()
    .custom((value, helpers) => {
      if (value) {
        const year = parseInt(value);
        const currentYear = new Date().getFullYear();
        if (year < 1800 || year > currentYear) {
          return helpers.error("any.invalid");
        }
      }
      return value;
    })
    .messages({
      "string.pattern.base": "Founded must be a valid 4-digit year (e.g., 2010)",
      "any.invalid": "Year must be between 1800 and current year",
    }),
  specialties: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().trim()),
      Joi.string().trim().max(500)
    )
    .optional()
    .messages({
      "string.max": "Specialties must not exceed 500 characters",
    }),
  contactEmail: Joi.string()
    .trim()
    .lowercase()
    .email()
    .required()
    .messages({
      "string.email": "Please enter a valid email address",
      "any.required": "Contact email is required",
    }),
  contactPhone: Joi.string()
    .trim()
    .pattern(/^[\d\s\-\+\(\)]{7,20}$/)
    .allow("", null)
    .optional()
    .messages({
      "string.pattern.base":
        "Please enter a valid phone number (7-20 digits, spaces, +, -, () allowed)",
    }),
  mission: trimString
    .max(1000)
    .allow("", null)
    .optional()
    .messages({
      "string.max": "Mission must not exceed 1000 characters",
      "string.notOnlySpaces": "Mission cannot contain only spaces",
    }),
  vision: trimString
    .max(1000)
    .allow("", null)
    .optional()
    .messages({
      "string.max": "Vision must not exceed 1000 characters",
      "string.notOnlySpaces": "Vision cannot contain only spaces",
    }),
});

// Fetch company profile (unchanged)
export const getCompanyProfile = async (req, res) => {
  try {
    let companyProfile = await CompanyProfile.findOne({
      company: req.user._id,
    });
    if (!companyProfile) {
      companyProfile = new CompanyProfile({
        company: req.user._id,
        companyName: req.user.companyName || "Your Company Name",
        phone: "",
        tagline: "",
        description: "",
        industry: "",
        website: "",
        headquarters: req.user.companyAddress || "",
        companyAddress: req.user.companyAddress || "",
        companyType: "",
        companySize: "",
        founded: "",
        specialties: [],
      });
      await companyProfile.save();
    } else if (!companyProfile.headquarters && companyProfile.companyAddress) {
      companyProfile.headquarters = companyProfile.companyAddress;
      await companyProfile.save();
    }

    const profileData = companyProfile.toObject();
    profileData.contactEmail = req.user.email;
    profileData.contactPhone = profileData.phone;
    res.json(profileData);
  } catch (error) {
    console.error("Error fetching company profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update company profile with sanitization and whitespace handling
export const updateCompanyProfile = async (req, res) => {
  try {
    // Validate incoming data
    const { error, value } = companyProfileSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      const messages = error.details.map((detail) => detail.message).join(", ");
      return res.status(400).json({ message: messages });
    }

    // Sanitize and trim all string values, remove extra whitespace
    const sanitizeValue = (val) => {
      if (typeof val === "string") {
        // Trim and replace multiple spaces with single space
        return val.trim().replace(/\s+/g, " ");
      }
      return val;
    };

    // Process specialties
    if (typeof value.specialties === "string") {
      value.specialties = value.specialties
        .split(",")
        .map((s) => sanitizeValue(s))
        .filter((s) => s);
    } else if (Array.isArray(value.specialties)) {
      value.specialties = value.specialties
        .map((s) => sanitizeValue(s))
        .filter((s) => s);
    }

    // Map contactEmail/contactPhone to email/phone fields
    if (value.contactEmail) {
      value.email = value.contactEmail.toLowerCase().trim();
      delete value.contactEmail;
    }
    if (value.contactPhone) {
      value.phone = sanitizeValue(value.contactPhone);
      delete value.contactPhone;
    }

    // Sanitize all other string fields
    Object.keys(value).forEach((key) => {
      if (typeof value[key] === "string" && key !== "specialties") {
        value[key] = sanitizeValue(value[key]);
      }
    });

    // Update profile in database
    const updatedProfile = await CompanyProfile.findOneAndUpdate(
      { company: req.user._id },
      value,
      { new: true, runValidators: true }
    );

    if (!updatedProfile) {
      return res.status(404).json({ message: "Company profile not found" });
    }

    // Return updated data with contactEmail/contactPhone for frontend compatibility
    const updatedData = updatedProfile.toObject();
    updatedData.contactEmail = req.user.email;
    updatedData.contactPhone = updatedData.phone;
    res.json(updatedData);
  } catch (error) {
    console.error("Error updating company profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Multer setup for logo upload (unchanged)
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = "uploads/logos";
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    cb(
      null,
      `logo-${req.user._id}-${Date.now()}${path.extname(file.originalname)}`
    );
  },
});

const logoUpload = multer({
  storage: logoStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("logo");

// Upload company logo (unchanged)
export const uploadCompanyLogo = async (req, res) => {
  logoUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    try {
      const logoUrl = `/uploads/logos/${req.file.filename}`;
      const updatedProfile = await CompanyProfile.findOneAndUpdate(
        { company: req.user._id },
        { logo: logoUrl },
        { new: true, runValidators: true }
      );
      return res.json({
        message: "Logo uploaded successfully",
        logo: updatedProfile.logo,
      });
    } catch (error) {
      console.error("Error updating logo:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
};

// Fetch 3 random companies with active job counts (for featured companies)
export const getRandomFeaturedCompanies = async (req, res) => {
  try {
    const count = await CompanyProfile.countDocuments();
    if (count === 0) {
      return res.status(404).json({ message: "No companies found" });
    }
    // Use aggregation to get 3 random companies
    const companies = await CompanyProfile.aggregate([
      { $sample: { size: 3 } },
    ]);
    // Calculate active job count for each company
    const companiesWithJobCount = await Promise.all(
      companies.map(async (company) => {
        const activeJobCount = await Job.countDocuments({
          companyId: company.company,
          status: "Open",
        });
        // Remove _id from the returned object
        const { _id, ...companyData } = company;
        return {
          ...companyData,
          totalActiveJobs: activeJobCount,
        };
      })
    );
    res.status(200).json(companiesWithJobCount);
  } catch (error) {
    console.error("Error fetching random featured companies:", error);
    res.status(500).json({ message: "Server error" });
  }
};
