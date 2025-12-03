// backend/controllers/resumeParserController.js

import axios from "axios";
import UserProfile from "../models/UserProfile.js";
import Skill from "../models/Skill.js";
import Experience from "../models/Experience.js";
import Education from "../models/Education.js";
import FormData from "form-data";
import fs from "fs";
import path from "path";

// Configuration for parser service
const PARSER_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // ms
  timeout: 30000, // 30 seconds
  minConfidence: 0.5, // Minimum confidence threshold
};

// Rate limiting: simple in-memory store for local/development use
const parseAttempts = new Map();
const RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 60000, // 1 minute
};

// Check rate limit
function checkRateLimit(userId) {
  const now = Date.now();
  const userAttempts = parseAttempts.get(userId) || [];
  
  // Clean old attempts
  const recentAttempts = userAttempts.filter(time => now - time < RATE_LIMIT.windowMs);
  
  if (recentAttempts.length >= RATE_LIMIT.maxAttempts) {
    return { allowed: false, retryAfter: Math.ceil((RATE_LIMIT.windowMs - (now - recentAttempts[0])) / 1000) };
  }
  
  recentAttempts.push(now);
  parseAttempts.set(userId, recentAttempts);
  return { allowed: true };
}

// Retry logic with exponential backoff
async function callParserWithRetry(parserUrl, formData, maxRetries = PARSER_CONFIG.maxRetries) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(parserUrl, formData, {
        headers: formData.getHeaders(),
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        timeout: PARSER_CONFIG.timeout,
        validateStatus: (s) => s >= 200 && s < 500,
      });
      
      if (response.status >= 400) {
        throw new Error(response.data?.error || response.data?.message || "Parser service error");
      }
      
      return response.data;
    } catch (error) {
      lastError = error;
      
      // Don't retry on 4xx errors (client errors)
      if (error.response && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, PARSER_CONFIG.retryDelay * attempt));
      }
    }
  }
  
  throw lastError;
}

// Filter data based on confidence scores
function filterByConfidence(data) {
  const filtered = { ...data };
  const threshold = PARSER_CONFIG.minConfidence;
  
  // Filter out low-confidence fields
  if (data.name_confidence && data.name_confidence < threshold) {
    filtered.name = "";
  }
  if (data.email_confidence && data.email_confidence < threshold) {
    filtered.email = "";
  }
  if (data.phone_confidence && data.phone_confidence < threshold) {
    filtered.phone = "";
  }
  if (data.title_confidence && data.title_confidence < threshold) {
    filtered.title = "";
  }
  if (data.about_confidence && data.about_confidence < threshold) {
    filtered.about = "";
  }
  
  // Filter skills by confidence
  if (Array.isArray(data.skills)) {
    filtered.skills = data.skills.filter(skill => {
      if (typeof skill === "object" && skill.confidence) {
        return skill.confidence >= threshold;
      }
      return true; // Keep skills without confidence scores
    });
  }
  
  return filtered;
}

// Helper to upsert skills and return their ObjectIds
async function upsertSkills(skills) {
  if (!skills || !Array.isArray(skills)) return [];
  const skillIds = [];
  for (const item of skills) {
    const skillName = typeof item === "string" ? item : item?.name;
    if (!skillName) continue;
    let skill = await Skill.findOne({ name: skillName });
    if (!skill) {
      skill = await Skill.create({ name: skillName });
    }
    skillIds.push(skill._id);
  }
  return skillIds;
}

export const parseResumeAndExtractProfile = async (req, res) => {
  try {
    // Rate limiting check
    const rateLimitCheck = checkRateLimit(req.user._id.toString());
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({ 
        message: `Too many parse requests. Please try again in ${rateLimitCheck.retryAfter} seconds.`,
        retryAfter: rateLimitCheck.retryAfter
      });
    }

    // Find user profile
    const profile = await UserProfile.findOne({ user: req.user._id });
    if (!profile || !profile.resume) {
      return res.status(400).json({ 
        message: "No resume uploaded.",
        hint: "Please upload a resume first before parsing."
      });
    }
    // Resolve absolute path to resume file robustly (Windows-friendly)
    const trimmed = profile.resume.startsWith("/")
      ? profile.resume.slice(1)
      : profile.resume;
    const resumePath = path.isAbsolute(trimmed)
      ? trimmed
      : path.join(process.cwd(), trimmed.replace(/^[./\\]+/, ""));

    if (!fs.existsSync(resumePath)) {
      return res.status(400).json({ 
        message: "Uploaded resume file not found on server.",
        hint: "The file may have been deleted. Please re-upload your resume."
      });
    }

    // Validate file size
    const fileStats = fs.statSync(resumePath);
    if (fileStats.size > 5 * 1024 * 1024) {
      return res.status(400).json({ 
        message: "Resume file is too large. Maximum size is 5MB.",
        fileSize: `${(fileStats.size / 1024 / 1024).toFixed(2)}MB`
      });
    }

    // Send file to Python resume parser with retry logic
    const formData = new FormData();
    formData.append(
      "file",
      fs.createReadStream(resumePath),
      profile.resumeName || "resume.pdf"
    );
    const parserUrl = process.env.RESUME_PARSER_URL || "http://localhost:5001/parse";
    
    let data;
    try {
      data = await callParserWithRetry(parserUrl, formData);
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || "Resume parsing service error";
      return res.status(502).json({ 
        message: "Failed to parse resume.",
        details: errorMessage,
        hint: "The parsing service may be unavailable. Please try again later."
      });
    }

    // Filter data by confidence scores
    const filteredData = filterByConfidence(data);

    // Normalize skills: support both ["React", ...] and [{ name, confidence }]
    const normalizedSkillsArray = Array.isArray(filteredData.skills) ? filteredData.skills : [];
    const skillNames = normalizedSkillsArray.map((s) => (typeof s === "string" ? s : s?.name)).filter(Boolean);
    
    // Remove duplicate skills (case-insensitive)
    const uniqueSkills = Array.from(new Set(skillNames.map(s => s.toLowerCase())));
    const finalSkills = uniqueSkills.map(lower => 
      skillNames.find(s => s.toLowerCase() === lower)
    );

    // Optionally auto-save to profile if requested
    const autoSave = String(req.query.autoSave || req.body?.autoSave || "false").toLowerCase() === "true";

    if (autoSave) {
      // Select confident values when present, fallback to existing
      const updated = {
        name: filteredData.name || profile.name,
        title: filteredData.title || profile.title,
        // Do not auto-update location from parser; keep existing
        location: profile.location,
        phone: filteredData.phone || profile.phone,
        about: filteredData.about || profile.about,
        socialLinks: {
          linkedin: filteredData.linkedin || profile.socialLinks?.linkedin || "",
          github: filteredData.github || profile.socialLinks?.github || "",
          twitter: filteredData.twitter || profile.socialLinks?.twitter || "",
          portfolio: filteredData.portfolio || profile.socialLinks?.portfolio || "",
        },
      };

      // Upsert skills and merge (use deduplicated skills)
      const skillIds = await upsertSkills(finalSkills);
      const existingSkillIds = Array.isArray(profile.skills) ? profile.skills.map((id) => String(id)) : [];
      const mergedSkillIds = Array.from(new Set([...(existingSkillIds || []), ...skillIds.map(String)])).map((id) => id);

      profile.name = updated.name;
      profile.title = updated.title;
      // Do not change location based on parser output
      profile.location = updated.location;
      profile.phone = updated.phone;
      profile.about = updated.about;
      profile.socialLinks = updated.socialLinks;
      profile.skills = mergedSkillIds;
      await profile.save();
      
      // Auto-save experience and education if provided
      if (Array.isArray(filteredData.experience) && filteredData.experience.length > 0) {
        await Experience.deleteMany({ user: req.user._id });
        const expDocs = filteredData.experience.map((exp) => ({
          ...exp,
          user: req.user._id,
        }));
        await Experience.insertMany(expDocs);
      }
      
      if (Array.isArray(filteredData.education) && filteredData.education.length > 0) {
        await Education.deleteMany({ user: req.user._id });
        const eduDocs = filteredData.education.map((edu) => ({
          ...edu,
          user: req.user._id,
        }));
        await Education.insertMany(eduDocs);
      }
    }

    // Prepare response for frontend autofill
    res.json({
      success: true,
      name: filteredData.name || profile.name,
      name_confidence: data.name_confidence ?? undefined,
      email: filteredData.email || profile.email,
      email_confidence: data.email_confidence ?? undefined,
      phone: filteredData.phone || profile.phone,
      phone_confidence: data.phone_confidence ?? undefined,
      title: filteredData.title || profile.title,
      title_confidence: data.title_confidence ?? undefined,
      // Do not allow parser to set city; keep current profile value
      location: profile.location || "",
      // Optionally provide a suggestion without applying it
      locationSuggestion: data.location || "",
      location_confidence: data.location_confidence ?? undefined,
      about: filteredData.about || profile.about,
      about_confidence: data.about_confidence ?? undefined,
      // Keep skills backward-compatible as an array of strings, and expose confidences separately
      skills: finalSkills,
      skillConfidences: Array.isArray(data.skills) ? data.skills : [],
      experience: filteredData.experience || [],
      education: filteredData.education || [],
      linkedin: filteredData.linkedin || profile.socialLinks?.linkedin || "",
      github: filteredData.github || profile.socialLinks?.github || "",
      twitter: filteredData.twitter || profile.socialLinks?.twitter || "",
      portfolio: filteredData.portfolio || profile.socialLinks?.portfolio || "",
      autoSaved: !!autoSave,
      // Metadata for user feedback
      metadata: {
        parseTimestamp: new Date().toISOString(),
        confidenceThreshold: PARSER_CONFIG.minConfidence,
        totalFieldsParsed: Object.keys(data).length,
        fieldsFiltered: Object.keys(data).filter(key => data[key] && !filteredData[key]).length,
      },
    });
  } catch (err) {
    console.error("Resume parse error:", err.message);
    console.error("Stack trace:", err.stack);
    
    // Determine appropriate error response
    let statusCode = 500;
    let message = "Failed to parse resume. Please try again.";
    let details = err.message;
    
    if (err.code === "ECONNREFUSED") {
      statusCode = 503;
      message = "Resume parsing service is currently unavailable.";
      details = "Please contact support if this persists.";
    } else if (err.response?.status === 413) {
      statusCode = 413;
      message = "Resume file is too large.";
      details = "Maximum file size is 5MB.";
    } else if (err.response?.status === 400) {
      statusCode = 400;
      message = "Invalid resume format.";
      details = "Please upload a PDF, DOCX, or TXT file.";
    }
    
    res.status(statusCode).json({ 
      success: false,
      message,
      details,
      timestamp: new Date().toISOString(),
    });
  }
};

// Health check endpoint for parser service
export const checkParserHealth = async (req, res) => {
  try {
    const parserUrl = process.env.RESUME_PARSER_URL || "http://localhost:5001/parse";
    const healthUrl = parserUrl.replace("/parse", "/health");
    
    const response = await axios.get(healthUrl, { timeout: 5000 });
    
    res.json({
      status: "ok",
      parserService: response.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: "Parser service is unavailable",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};
