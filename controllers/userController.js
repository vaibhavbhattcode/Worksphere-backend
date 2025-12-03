// ----------------------------------
// GET PROFILE BY USER ID (for company view)
// ----------------------------------
export const getProfileById = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "Missing userId parameter" });
    }
    // Run primary profile fetch and related collections concurrently for lower latency
    const [profile, experiences, education, certificates, userDoc] = await Promise.all([
      UserProfile.findOne({ user: userId })
        .select('user name title location phone about skills socialLinks profileImage resume resumeName videoIntroduction resumePreferences resumeBuilder.lastUpdated resumeBuilder.generatedPdfPath resumeBuilder.generatedPdfName')
        .populate('skills', 'name')
        .lean(),
      Experience.find({ user: userId }).select('-__v').lean(),
      Education.find({ user: userId }).select('-__v').lean(),
      Certificate.find({ user: userId }).select('-__v').lean(),
      import("../models/User.js").then(m => m.default.findById(userId).select('email').lean())
    ]);

    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    ensureResumePreferenceDefaults(profile);
    const { resumeBuilder, resumePreferences: _profileResumePrefs, ...profileRest } = profile;
    const resumePreferences = mapResumePreferencesForResponse(profile);

    res.json({
      ...profileRest,
      skills: Array.isArray(profile.skills) ? profile.skills.map((s) => s.name) : [],
      experience: experiences,
      education,
      certificates,
      email: userDoc?.email || "",
      resumePreferences,
    });
  } catch (error) {
    console.error("Error fetching profile by userId:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// controllers/userController.js
import Job from "../models/Job.js";
import Company from "../models/Company.js";
import Application from "../models/Application.js";

import UserProfile from "../models/UserProfile.js";
import Experience from "../models/Experience.js";
import Education from "../models/Education.js";
import Certificate from "../models/Certificate.js";
import Skill from "../models/Skill.js"; // Import the new Skill model
import multer from "multer";
import fs from "fs";
import path from "path";
import Joi from "joi";

const fsp = fs.promises;

const ensureResumePreferenceDefaults = (profile) => {
  if (!profile.resumePreferences) {
    profile.resumePreferences = {
      activeSource: profile.resume ? "uploaded" : "builder",
    };
  }

  if (!profile.resumePreferences.uploaded) {
    profile.resumePreferences.uploaded = {
      path: "",
      name: "",
      lastUpdated: null,
    };
  }

  if (!profile.resumePreferences.builder) {
    profile.resumePreferences.builder = {
      path: profile.resumeBuilder?.generatedPdfPath || "",
      name: profile.resumeBuilder?.generatedPdfName || "",
      lastGenerated: profile.resumeBuilder?.lastUpdated || null,
    };
  } else {
    if (
      !profile.resumePreferences.builder.path &&
      profile.resumeBuilder?.generatedPdfPath
    ) {
      profile.resumePreferences.builder.path =
        profile.resumeBuilder.generatedPdfPath;
    }
    if (
      !profile.resumePreferences.builder.name &&
      profile.resumeBuilder?.generatedPdfName
    ) {
      profile.resumePreferences.builder.name =
        profile.resumeBuilder.generatedPdfName;
    }
    if (
      !profile.resumePreferences.builder.lastGenerated &&
      profile.resumeBuilder?.lastUpdated
    ) {
      profile.resumePreferences.builder.lastGenerated =
        profile.resumeBuilder.lastUpdated;
    }
  }

  if (
    !profile.resumePreferences.uploaded.path &&
    profile.resume &&
    profile.resumePreferences.activeSource === "uploaded"
  ) {
    profile.resumePreferences.uploaded.path = profile.resume;
    profile.resumePreferences.uploaded.name = profile.resumeName || "";
    profile.resumePreferences.uploaded.lastUpdated = new Date();
  }
};

const buildSafeFileName = (nameHint = "resume-builder") => {
  const base = (nameHint || "resume-builder")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const safeBase = base || "resume-builder";
  return `${safeBase}-${Date.now()}.pdf`;
};

const deleteFileIfExists = async (relativePath) => {
  if (!relativePath) return;
  const trimmed = relativePath.startsWith("/")
    ? relativePath.slice(1)
    : relativePath;
  const absolutePath = path.join(process.cwd(), trimmed);
  try {
    await fsp.unlink(absolutePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Error removing file", absolutePath, err);
    }
  }
};

const persistBuilderPdf = async (pdfDataUrl, userId, nameHint = "") => {
  if (!pdfDataUrl) {
    throw new Error("Missing PDF data");
  }

  const base64Marker = "base64,";
  const markerIndex = pdfDataUrl.indexOf(base64Marker);
  const base64String =
    markerIndex >= 0
      ? pdfDataUrl.slice(markerIndex + base64Marker.length)
      : pdfDataUrl;

  if (!base64String) {
    throw new Error("Invalid PDF payload");
  }

  const buffer = Buffer.from(base64String, "base64");
  const dir = path.join(
    "uploads",
    "resumes",
    "builder",
    userId.toString()
  );
  fs.mkdirSync(dir, { recursive: true });

  const fileName = buildSafeFileName(nameHint);
  const filePath = path.join(dir, fileName);
  await fsp.writeFile(filePath, buffer);

  const normalized = `/${filePath.split(path.sep).join("/")}`;

  return {
    relativePath: normalized,
    fileName,
  };
};

const mapResumePreferencesForResponse = (profile) => {
  const prefs = profile.resumePreferences || {};
  const builder = prefs.builder || {};
  const uploaded = prefs.uploaded || {};
  const builderLastUpdated =
    builder.lastGenerated || profile.resumeBuilder?.lastUpdated || null;

  return {
    activeSource:
      prefs.activeSource || (profile.resume ? "uploaded" : "builder"),
    builderLastUpdated,
    builderResume: builder.path
      ? { url: builder.path, name: builder.name || "" }
      : null,
    uploadedResume: uploaded.path
      ? { url: uploaded.path, name: uploaded.name || "" }
      : null,
  };
};

// ----------------------------------
// Joi Validation Schema
// ----------------------------------
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).required(),
  title: Joi.string().required(),
  location: Joi.string().required(),
  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{6,14}$/)
    .allow("")
    .optional(),

  about: Joi.string().allow(""),
  experience: Joi.array().items(
    Joi.object({
      company: Joi.string().allow(""),
      position: Joi.string().allow(""),
      start: Joi.string().allow(""),
      end: Joi.string().allow(""),
      description: Joi.string().allow(""),
    })
  ),
  education: Joi.array().items(
    Joi.object({
      institution: Joi.string().allow(""),
      degree: Joi.string().allow(""),
      year: Joi.string().allow(""),
    })
  ),
  skills: Joi.array().items(Joi.string()).default([]),
  certifications: Joi.array().items(
    Joi.object({
      title: Joi.string().allow(""),
      fileUrl: Joi.string().allow(""),
      issue_date: Joi.string().allow(""),
      expiry_date: Joi.string().allow(""),
    })
  ).optional(),
  linkedin: Joi.string().uri().allow(""),
  github: Joi.string().uri().allow(""),
  twitter: Joi.string().uri().allow(""),
  portfolio: Joi.string().uri().allow(""),
});

const builderEducationSchema = Joi.object({
  institution: Joi.string().allow(""),
  degree: Joi.string().allow(""),
  fieldOfStudy: Joi.string().allow(""),
  startDate: Joi.string().allow(""),
  endDate: Joi.string().allow(""),
  grade: Joi.string().allow(""),
  description: Joi.string().allow(""),
});

const builderExperienceSchema = Joi.object({
  position: Joi.string().allow(""),
  company: Joi.string().allow(""),
  startDate: Joi.string().allow(""),
  endDate: Joi.string().allow(""),
  description: Joi.string().allow(""),
});

const builderProjectSchema = Joi.object({
  title: Joi.string().allow(""),
  description: Joi.string().allow(""),
  technologies: Joi.string().allow(""),
  url: Joi.string().allow(""),
});

const resumeBuilderSaveSchema = Joi.object({
  templateId: Joi.number().integer().min(1).max(30).default(1),
  personalInfo: Joi.object({
    name: Joi.string().allow(""),
    title: Joi.string().allow(""),
    location: Joi.string().allow(""),
    email: Joi.string().email().allow(""),
    phone: Joi.string().allow(""),
    about: Joi.string().allow(""),
  }).required(),
  education: Joi.array().items(builderEducationSchema).default([]),
  experience: Joi.array().items(builderExperienceSchema).default([]),
  projects: Joi.array().items(builderProjectSchema).default([]),
  skills: Joi.array().items(Joi.string().allow("")).default([]),
  pdfData: Joi.string().allow(""),
  setAsActiveSource: Joi.boolean().optional(),
});

const resumeSourcePreferenceSchema = Joi.object({
  activeSource: Joi.string().valid("uploaded", "builder").required(),
});

// ----------------------------------
// GET and UPDATE PROFILE
// ----------------------------------
export const getProfile = async (req, res) => {
  try {
    const [profile, experiences, education, certificates] = await Promise.all([
      UserProfile.findOne({ user: req.user._id })
        .select('user name title location phone about skills socialLinks profileImage resume resumeName videoIntroduction profileViews interactions jobMatchRank viewsOverTime resumeBuilder.lastUpdated resumeBuilder.generatedPdfPath resumeBuilder.generatedPdfName resumePreferences')
        .populate('skills', 'name')
        .lean(),
      Experience.find({ user: req.user._id }).select('-__v').lean(),
      Education.find({ user: req.user._id }).select('-__v').lean(),
      Certificate.find({ user: req.user._id }).select('-__v').lean()
    ]);

    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    ensureResumePreferenceDefaults(profile);
    const { resumeBuilder, resumePreferences: _profileResumePrefs, ...profileRest } = profile;
    const resumePreferences = mapResumePreferencesForResponse(profile);

    res.json({
      ...profileRest,
      skills: Array.isArray(profile.skills) ? profile.skills.map((s) => s.name) : [],
      experience: experiences,
      education,
      certificates,
      email: req.user.email,
      resumePreferences,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { error, value } = updateProfileSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const {
      name,
      title,
      location,
      phone,
      about,
      skills,
      certifications,
      linkedin,
      github,
      twitter,
      portfolio,
    } = value;

    const socialLinks = {
      linkedin: linkedin || "",
      github: github || "",
      twitter: twitter || "",
      portfolio: portfolio || "",
    };

    // Convert each skill name to its corresponding ObjectId
    const skillIds = await Promise.all(
      skills.map(async (skillName) => {
        let skillDoc = await Skill.findOne({ name: skillName });
        if (!skillDoc) {
          skillDoc = await Skill.create({ name: skillName });
        }
        return skillDoc._id;
      })
    );

    // Update the profile data (email is not updated)
    const updatedProfile = await UserProfile.findOneAndUpdate(
      { user: req.user._id },
      {
        name,
        title,
        location,
        phone,
        about,
        skills: skillIds,
        socialLinks,
      },
      { new: true, runValidators: true }
    );

    // Update experience if provided
    if (value.experience) {
      await Experience.deleteMany({ user: req.user._id });
      const expDocs = value.experience.map((exp) => ({
        ...exp,
        user: req.user._id,
      }));
      await Experience.insertMany(expDocs);
    }

    // Update education if provided
    if (value.education) {
      await Education.deleteMany({ user: req.user._id });
      const eduDocs = value.education.map((edu) => ({
        ...edu,
        user: req.user._id,
      }));
      await Education.insertMany(eduDocs);
    }

    // Update certifications if provided
    const certificationsProvided =
      Object.prototype.hasOwnProperty.call(req.body, "certifications");
    if (certificationsProvided) {
      await Certificate.deleteMany({ user: req.user._id });
      const certDocs = Array.isArray(value.certifications)
        ? value.certifications.map((cert) => ({
            ...cert,
            user: req.user._id,
          }))
        : [];

      if (certDocs.length > 0) {
        await Certificate.insertMany(certDocs);
      }
    }

    // Re-fetch related documents
    const experiencesData = await Experience.find({ user: req.user._id }).select('-__v').lean();
    const educationData = await Education.find({ user: req.user._id }).select('-__v').lean();
    const certificates = await Certificate.find({ user: req.user._id }).select('-__v').lean();

    // Populate skills before sending response
    await updatedProfile.populate({ path: 'skills', select: 'name' });

    const profileData = updatedProfile.toObject();
    profileData.skills = updatedProfile.skills
      ? updatedProfile.skills.map((skill) => skill.name)
      : [];
    profileData.experience = experiencesData;
    profileData.education = educationData;
    profileData.certificates = certificates;
    profileData.email = req.user.email;
    const resumePreferences = mapResumePreferencesForResponse(updatedProfile);
    profileData.resumePreferences = resumePreferences;

    res.json(profileData);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ----------------------------------
// PHOTO UPLOAD
// ----------------------------------
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = "uploads/photos";
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    cb(null, `photo-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const photoUpload = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for photo
});

export const uploadPhoto = [
  photoUpload.single("profilePhoto"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    try {
  const profile = await UserProfile.findOne({ user: req.user._id });
      if (!profile) {
        return res.status(404).json({ message: "User profile not found" });
      }
      profile.profileImage = `/uploads/photos/${req.file.filename}`;
      await profile.save();
      res.json({ profileImage: profile.profileImage });
    } catch (error) {
      console.error("Error uploading photo:", error);
      res.status(500).json({ message: "Server error" });
    }
  },
];

// ----------------------------------
// RESUME UPLOAD (5MB limit + custom error handling)
// ----------------------------------
const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = "uploads/resumes";
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    cb(null, `resume-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const resumeUpload = multer({
  storage: resumeStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for resume
});

export const uploadResume = [
  // Custom middleware to handle Multer errors
  (req, res, next) => {
    resumeUpload.single("resume")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res
            .status(400)
            .json({ message: "File size exceeds the maximum limit of 5MB." });
        }
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  // Actual controller logic
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    try {
      const profile = await UserProfile.findOne({ user: req.user._id });
      if (!profile) {
        return res.status(404).json({ message: "User profile not found" });
      }
      ensureResumePreferenceDefaults(profile);

      const now = new Date();
      const newResumePath = `/uploads/resumes/${req.file.filename}`;
      const newResumeName = req.file.originalname;
      const previousUploadedPath = profile.resumePreferences.uploaded.path;

      profile.resume = newResumePath;
      profile.resumeName = newResumeName;
      profile.resumePreferences.uploaded = {
        path: newResumePath,
        name: newResumeName,
        lastUpdated: now,
      };
      profile.resumePreferences.activeSource = "uploaded";
      profile.markModified?.("resumePreferences");

      await profile.save();

      if (previousUploadedPath && previousUploadedPath !== newResumePath) {
        await deleteFileIfExists(previousUploadedPath);
      }

      const responsePreferences = mapResumePreferencesForResponse(profile);

      res.json({
        resume: profile.resume,
        resumeName: profile.resumeName,
        resumePreferences: responsePreferences,
      });
    } catch (error) {
      console.error("Error uploading resume:", error);
      res.status(500).json({ message: "Server error" });
    }
  },
];

export const removeResume = async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ user: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }
    ensureResumePreferenceDefaults(profile);

    const uploadedInfo = profile.resumePreferences.uploaded || {};
    if (!uploadedInfo.path) {
      return res
        .status(400)
        .json({ message: "No uploaded resume to remove." });
    }

    const uploadedPath = uploadedInfo.path;
    profile.resumePreferences.uploaded = {
      path: "",
      name: "",
      lastUpdated: null,
    };

    if (profile.resumePreferences.activeSource === "uploaded") {
      const builderInfo = profile.resumePreferences.builder || {};
      if (builderInfo.path) {
        profile.resume = builderInfo.path;
        profile.resumeName = builderInfo.name || "";
        profile.resumePreferences.activeSource = "builder";
      } else {
        profile.resume = null;
        profile.resumeName = null;
        profile.resumePreferences.activeSource = "builder";
      }
    } else if (profile.resume === uploadedPath) {
      // Uploaded resume was stored but not active; clear reference.
      if (profile.resumePreferences.builder?.path) {
        profile.resume = profile.resumePreferences.builder.path;
        profile.resumeName = profile.resumePreferences.builder.name || "";
      } else {
        profile.resume = null;
        profile.resumeName = null;
      }
    }

    profile.markModified?.("resumePreferences");
    await profile.save();

    if (uploadedPath) {
      await deleteFileIfExists(uploadedPath);
    }

    const responsePreferences = mapResumePreferencesForResponse(profile);

    res.json({
      resume: profile.resume || null,
      resumeName: profile.resumeName || null,
      resumePreferences: responsePreferences,
    });
  } catch (error) {
    console.error("Error removing resume:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getResumeBuilderState = async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ user: req.user._id })
      .populate("skills", "name")
      .lean();

    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    ensureResumePreferenceDefaults(profile);

    const [experienceDocs, educationDocs] = await Promise.all([
      Experience.find({ user: req.user._id }).select("-__v").lean(),
      Education.find({ user: req.user._id }).select("-__v").lean(),
    ]);

    const builder = profile.resumeBuilder || {};
    const personalInfo = builder.personalInfo || {};

    // Prefer the live `UserProfile` values (profile) for up-to-date data,
    // but allow explicit builder values to override when intentionally set.
    const fallbackPersonalInfo = {
      name: (profile.name && profile.name.toString().trim()) ? profile.name : (personalInfo.name || ""),
      title: (profile.title && profile.title.toString().trim()) ? profile.title : (personalInfo.title || ""),
      location: (profile.location && profile.location.toString().trim()) ? profile.location : (personalInfo.location || ""),
      email: (req.user.email && req.user.email.toString().trim()) ? req.user.email : (personalInfo.email || ""),
      phone: (profile.phone && profile.phone.toString().trim()) ? profile.phone : (personalInfo.phone || ""),
      about: (profile.about && profile.about.toString().trim()) ? profile.about : (personalInfo.about || ""),
    };

    const defaultEducation = (builder.education || []).length
      ? builder.education
      : educationDocs.map((edu) => ({
          institution: edu.institution || "",
          degree: edu.degree || "",
          fieldOfStudy: "",
          startDate: "",
          endDate: edu.year || "",
          grade: "",
          description: "",
        }));

    const defaultExperience = (builder.experience || []).length
      ? builder.experience
      : experienceDocs.map((exp) => ({
          position: exp.position || "",
          company: exp.company || "",
          startDate: exp.start || "",
          endDate: exp.end || "",
          description: exp.description || "",
        }));

    const profileSkills = Array.isArray(profile.skills)
      ? profile.skills
          .map((skill) =>
            typeof skill === "string" ? skill : skill?.name || ""
          )
          .filter(Boolean)
      : [];

    const responseSkills = Array.isArray(builder.skills) && builder.skills.length
      ? builder.skills.filter((skill) => skill && skill.trim() !== "")
      : profileSkills;

  const preferences = mapResumePreferencesForResponse(profile);
    const { activeSource, uploadedResume, builderResume, builderLastUpdated } =
      preferences;

    res.json({
      templateId: builder.templateId || 1,
      personalInfo: fallbackPersonalInfo,
      education: defaultEducation,
      experience: defaultExperience,
      projects: Array.isArray(builder.projects) ? builder.projects : [],
      skills: responseSkills,
      resumePreferences: {
        activeSource,
        uploadedResume,
        builderResume,
        builderLastUpdated,
      },
      lastUpdated: builder.lastUpdated || null,
    });
  } catch (error) {
    console.error("Error fetching resume builder state:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const saveResumeBuilderState = async (req, res) => {
  try {
    const { error, value } = resumeBuilderSaveSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const profile = await UserProfile.findOne({ user: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    ensureResumePreferenceDefaults(profile);

    const {
      setAsActiveSource = false,
      templateId,
      personalInfo,
      education,
      experience,
      projects,
      skills,
      pdfData,
    } = value;

    const sanitizeEducation = Array.isArray(education)
      ? education.map((edu) => ({
          institution: edu.institution || "",
          degree: edu.degree || "",
          fieldOfStudy: edu.fieldOfStudy || "",
          startDate: edu.startDate || "",
          endDate: edu.endDate || "",
          grade: edu.grade || "",
          description: edu.description || "",
        }))
      : [];

    const sanitizeExperience = Array.isArray(experience)
      ? experience.map((exp) => ({
          position: exp.position || "",
          company: exp.company || "",
          startDate: exp.startDate || "",
          endDate: exp.endDate || "",
          description: exp.description || "",
        }))
      : [];

    const sanitizeProjects = Array.isArray(projects)
      ? projects.map((proj) => ({
          title: proj.title || "",
          description: proj.description || "",
          technologies: proj.technologies || "",
          url: proj.url || "",
        }))
      : [];

    const sanitizeSkills = Array.isArray(skills)
      ? skills.filter((skill) => skill && skill.trim() !== "")
      : [];

    const now = new Date();
    const previousBuilderPath = profile.resumeBuilder?.generatedPdfPath || "";
    const previousBuilderName = profile.resumeBuilder?.generatedPdfName || "";

    profile.resumeBuilder = {
      templateId,
      personalInfo: {
        name: personalInfo.name || "",
        title: personalInfo.title || "",
        location: personalInfo.location || "",
        email: personalInfo.email || "",
        phone: personalInfo.phone || "",
        about: personalInfo.about || "",
      },
      education: sanitizeEducation,
      experience: sanitizeExperience,
      projects: sanitizeProjects,
      skills: sanitizeSkills,
      lastUpdated: now,
      generatedPdfPath: previousBuilderPath,
      generatedPdfName: previousBuilderName,
    };

    let builderPath = previousBuilderPath;
    let builderName = previousBuilderName;

    if (pdfData && pdfData.trim()) {
      try {
        const { relativePath, fileName } = await persistBuilderPdf(
          pdfData,
          req.user._id,
          personalInfo?.name || profile.name || "resume-builder"
        );
        builderPath = relativePath;
        builderName = fileName;
        profile.resumeBuilder.generatedPdfPath = relativePath;
        profile.resumeBuilder.generatedPdfName = fileName;
        profile.resumePreferences.builder.path = relativePath;
        profile.resumePreferences.builder.name = fileName;
        profile.resumePreferences.builder.lastGenerated = now;
      } catch (persistError) {
        console.error("Failed to store builder PDF:", persistError);
        return res
          .status(500)
          .json({ message: "Unable to store generated resume PDF." });
      }
    }

    const builderAvailable = Boolean(builderPath);

    if (setAsActiveSource && !builderAvailable) {
      return res
        .status(400)
        .json({ message: "Save your builder resume before activating it." });
    }

    if (
      (setAsActiveSource || !profile.resumePreferences.activeSource) &&
      builderAvailable
    ) {
      profile.resumePreferences.activeSource = "builder";
    }

    if (
      profile.resumePreferences.activeSource === "builder" &&
      builderAvailable
    ) {
      profile.resume = builderPath;
      profile.resumeName = builderName;
    }

    if (builderAvailable && !profile.resumePreferences.builder.path) {
      profile.resumePreferences.builder.path = builderPath;
      profile.resumePreferences.builder.name = builderName;
    }

    if (
      builderAvailable &&
      !profile.resumePreferences.builder.lastGenerated &&
      profile.resumeBuilder.lastUpdated
    ) {
      profile.resumePreferences.builder.lastGenerated =
        profile.resumeBuilder.lastUpdated;
    }

    profile.markModified?.("resumeBuilder");
    profile.markModified?.("resumePreferences");
    await profile.save();

    if (
      pdfData &&
      previousBuilderPath &&
      previousBuilderPath !== builderPath
    ) {
      await deleteFileIfExists(previousBuilderPath);
    }

    const resumePreferences = mapResumePreferencesForResponse(profile);

    res.json({
      message: setAsActiveSource
        ? "Resume saved and builder set as active."
        : "Resume builder saved",
      lastUpdated: profile.resumeBuilder?.lastUpdated || now,
      resumePreferences,
    });
  } catch (error) {
    console.error("Error saving resume builder state:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateResumeSourcePreference = async (req, res) => {
  try {
    const { error, value } = resumeSourcePreferenceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const profile = await UserProfile.findOne({ user: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    ensureResumePreferenceDefaults(profile);

    const desiredSource = value.activeSource;
    const uploadedInfo = profile.resumePreferences.uploaded || {};
    const builderInfo = profile.resumePreferences.builder || {};

    if (desiredSource === "uploaded") {
      if (!uploadedInfo.path) {
        return res
          .status(400)
          .json({ message: "No uploaded resume available to activate." });
      }

      profile.resumePreferences.activeSource = "uploaded";
      profile.resume = uploadedInfo.path;
      profile.resumeName = uploadedInfo.name || profile.resumeName || "";
    } else {
      const builderPath = builderInfo.path || profile.resumeBuilder?.generatedPdfPath;
      if (!builderPath) {
        return res
          .status(400)
          .json({ message: "Save your builder resume before activating it." });
      }

      profile.resumePreferences.activeSource = "builder";
      profile.resume = builderPath;
      profile.resumeName = builderInfo.name || profile.resumeName || "";
    }

    profile.markModified?.("resumePreferences");
    await profile.save();

    const responsePreferences = mapResumePreferencesForResponse(profile);

    res.json({
      resumePreferences: responsePreferences,
      resume: profile.resume || null,
      resumeName: profile.resumeName || "",
    });
  } catch (error) {
    console.error("Error updating resume source preference:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ----------------------------------
// CERTIFICATE UPLOAD (5MB limit)
// ----------------------------------
const certificateStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = "uploads/certificates";
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    cb(null, `certificate-${Date.now()}${path.extname(file.originalname)}`);
  },
});

export const certificateUpload = multer({
  storage: certificateStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadCertificate = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ message: "Certificate title is required" });
  }
  try {
    const newCert = new Certificate({
      user: req.user._id,
      title,
      fileUrl: `/uploads/certificates/${req.file.filename}`,
    });
    await newCert.save();
    res.status(201).json({ certificate: newCert });
  } catch (error) {
    console.error("Error uploading certificate:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const cert = await Certificate.findOne({
      _id: certificateId,
      user: req.user._id,
    });
    if (!cert) {
      return res.status(404).json({ message: "Certificate not found" });
    }
    await Certificate.deleteOne({ _id: certificateId });
    res.json({ message: "Certificate removed", certificate: cert });
  } catch (error) {
    console.error("Error deleting certificate:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ----------------------------------
// VIDEO UPLOAD (10MB limit)
// ----------------------------------
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = "uploads/video";
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    cb(null, `video-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const uploadVideoIntro = [
  videoUpload.single("videoIntro"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No video uploaded" });
    }
    try {
  const profile = await UserProfile.findOne({ user: req.user._id });
      if (!profile) {
        return res.status(404).json({ message: "User profile not found" });
      }
      profile.videoIntroduction = `/uploads/video/${req.file.filename}`;
      await profile.save();
      res.json({ videoIntroduction: profile.videoIntroduction });
    } catch (error) {
      console.error("Error uploading video:", error);
      res.status(500).json({ message: "Server error" });
    }
  },
];

export const deleteVideoIntro = async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ user: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }
    profile.videoIntroduction = "";
    await profile.save();
    res.json({ message: "Video introduction removed" });
  } catch (error) {
    console.error("Error deleting video:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ----------------------------------
// ANALYTICS
// ----------------------------------
export const getAnalytics = async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ user: req.user._id }).select('profileViews interactions jobMatchRank viewsOverTime').lean();
    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }
    const analyticsData = {
      profileViews: profile.profileViews || 0,
      interactions: profile.interactions || 0,
      jobMatchRank: profile.jobMatchRank || 0,
      viewsOverTime: profile.viewsOverTime || [],
    };
  res.json(analyticsData);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getUserDashboardOverview = async (req, res) => {
  try {
    // Fetch all metrics in parallel for better performance
    const [totalJobs, totalCompanies, totalApplications, usersHired] = await Promise.all([
      Job.countDocuments(), // Total jobs posted on platform
      Company.countDocuments(), // Total registered companies
      Application.countDocuments(), // Total applications submitted
      Application.countDocuments({ status: 'hired' }) // Users who got hired through platform
    ]);

    // Calculate success rate: percentage of applications that resulted in hiring
    const successRate = totalApplications > 0
      ? Math.round((usersHired / totalApplications) * 100)
      : 0;

    return res.json({
      totalJobs,
      totalCompanies,
      successRate,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
