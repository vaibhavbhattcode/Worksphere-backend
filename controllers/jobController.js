import Joi from "joi";
import validator from "validator";
import { getJobsWithPopulation, getUserKeywords, buildJobQuery, paginate } from '../utils/dbService.js';
import Job from "../models/Job.js";
import Applicant from "../models/Application.js";
import Notification from "../models/Notification.js";
import UserProfile from "../models/UserProfile.js";
import User from "../models/User.js";
import Search from "../models/Search.js";
import CompanyProfile from "../models/CompanyProfile.js";
import Industry from "../models/Industry.js";
import Skill from "../models/Skill.js";
import { notificationQueue, emailQueue } from '../utils/queueService.js';

// Custom Joi extension to trim and check for whitespace-only strings
const trimString = Joi.string().trim().custom((value, helpers) => {
  if (value && value.trim().length === 0) {
    return helpers.error('string.notOnlySpaces');
  }
  return value;
});

// Schemas for creating/updating a Job
const jobSchema = Joi.object({
  salaryType: Joi.string().valid('range','exact','negotiable').required(),
  payPeriod: Joi.string().valid('year','month','hour','day').required(),
  jobTitle: trimString
    .min(3)
    .max(100)
    .pattern(/^[a-zA-Z0-9\s&\-\|\(\)\.,'"/#]+$/)
    .required()
    .messages({
      'string.min': 'Job title must be at least 3 characters long',
      'string.max': 'Job title cannot exceed 100 characters',
      'string.notOnlySpaces': 'Job title cannot be empty or contain only spaces',
      'string.pattern.base': 'Job title can only contain letters, numbers, spaces, and special characters like &, -, |, (, ), ., ,, \' , ", /, #'
    }),
  description: trimString
    .min(30)
    .max(5000)
    .required()
    .messages({
      'string.min': 'Description must be at least 30 characters long',
      'string.max': 'Description cannot exceed 5000 characters',
      'string.notOnlySpaces': 'Description cannot be empty or contain only spaces'
    }),
  jobType: Joi.string()
    .valid("Full-time", "Part-time", "Contract", "Internship", "Temporary")
    .required(),
  location: trimString
    .required()
    .messages({
      'string.notOnlySpaces': 'Location cannot be empty or contain only spaces'
    }),
  industry: Joi.string().required(), // Industry name (will be converted to ObjectId)
  remoteOption: Joi.boolean().default(false),
  skills: Joi.string().allow("", null).optional()
    .custom((value, helpers) => {
      if (!value || value.trim().length === 0) return null;
      const trimmed = value.trim();
      const skillsArray = trimmed.split(",").map((s) => s.trim()).filter(s => s.length > 0);
      if (skillsArray.length > 0) {
        const invalidSkills = skillsArray.filter(skill => skill.length < 2);
        if (invalidSkills.length > 0) {
          return helpers.error('string.invalidSkills');
        }
      }
      return value;
    })
    .messages({
      'string.invalidSkills': 'Each skill must be at least 2 characters long'
    }),
  experienceLevel: Joi.string()
    .valid("Entry-level", "Mid-level", "Senior", "Executive", null, "")
    .allow(null, "")
    .optional(),
  applicationDeadline: Joi.date()
    .greater("now")
    .allow(null)
    .optional(),
  salaryRange: Joi.string().allow("", null).optional(),
  exactSalary: Joi.number().allow(null).optional()
    .when('salaryType', { is: 'exact', then: Joi.number().min(0).required() }),
  minSalary: Joi.number().allow(null).optional()
    .when('salaryType', { is: 'range', then: Joi.number().min(0).required() }),
  maxSalary: Joi.number().allow(null).optional()
    .when('salaryType', { is: 'range', then: Joi.number().min(0).required() }),
  currency: Joi.alternatives().conditional('salaryType', {
    is: 'negotiable',
    then: Joi.any().optional().allow(null, ''),
    otherwise: Joi.string().uppercase().length(3).required()
  }),
  benefits: Joi.string().allow("", null).max(2000).optional(),
  responsibilities: Joi.string().allow("", null).max(3000).optional(),
  qualifications: Joi.string().allow("", null).max(3000).optional(),
}).custom((value, helpers) => {
  // Validate salary range if any salary field is provided
  const { salaryType, minSalary, maxSalary, exactSalary } = value;
  if (salaryType === 'range') {
    if (minSalary == null || maxSalary == null) {
      return helpers.error('any.custom', { message: 'Both min and max salary are required for range' });
    }
    if (maxSalary <= minSalary) {
      return helpers.error('custom.salaryRange');
    }
  }
  if (salaryType === 'exact') {
    if (exactSalary == null) {
      return helpers.error('any.custom', { message: 'Exact salary is required' });
    }
  }
  
  return value;
}).messages({
  'custom.salaryRange': 'Maximum salary must be greater than minimum salary'
}).unknown(true);

const updateJobSchema = jobSchema;

//////////////////////////////
// Create a new Job
//////////////////////////////
export const createJob = async (req, res) => {
  // NOTE: Allow frontend to provide a currency even when salaryType is 'negotiable'.
  // Previously we forced `req.body.currency = null` which prevented storing a chosen
  // currency for negotiable postings — remove that behavior so companies can pick a currency.

  const { error, value } = jobSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  // Sanitize all string inputs
  const sanitize = (str) =>
    typeof str === "string"
      ? validator.escape(validator.stripLow(str.trim(), true))
      : str;

  const jobTitle = sanitize(value.jobTitle);
  const description = sanitize(value.description);
  const jobType = sanitize(value.jobType);
  const location = sanitize(value.location);
  // Use a raw trimmed industry name for lookup (don't HTML-escape before DB match)
  const industryNameRaw = typeof value.industry === 'string' ? value.industry.trim() : value.industry;
  const industryName = sanitize(value.industry);
  // Ensure remoteOption is a boolean (accept both boolean and string 'true')
  const remoteOption = value.remoteOption === true || String(value.remoteOption) === 'true';
  const salaryType = value.salaryType;
  const payPeriod = value.payPeriod;
  const skills = sanitize(value.skills);
  const experienceLevel = sanitize(value.experienceLevel);
  const applicationDeadline = value.applicationDeadline;
  const salaryRange = sanitize(value.salaryRange);
  const exactSalary = value.exactSalary;
  const minSalary = value.minSalary;
  const maxSalary = value.maxSalary;
  const currency = sanitize(value.currency);
  const benefits = sanitize(value.benefits);
  const responsibilities = sanitize(value.responsibilities);
  const qualifications = sanitize(value.qualifications);

  const contactEmail = req.user.email;
  const companyId = req.user._id;

  // Validate and convert industry name to ObjectId
  // Try exact name match first using the raw trimmed value (avoid HTML-escaping altering characters like &)
  let industry = await Industry.findOne({ name: industryNameRaw });
  if (!industry && industryNameRaw) {
    // Fallback: try matching by slug generated from the frontend value
    const slugCandidate = String(industryNameRaw)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
    if (slugCandidate) {
      industry = await Industry.findOne({ slug: slugCandidate });
    }
  }
  if (!industry) {
    return res.status(400).json({ message: "Invalid industry selected" });
  }

  const skillsArray = skills
    ? skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  let salary;
  if (salaryType === 'range' && minSalary != null && maxSalary != null && currency) {
    salary = {
      min: parseFloat(minSalary),
      max: parseFloat(maxSalary),
      currency: currency.toUpperCase(),
    };
  } else if (salaryType === 'exact' && exactSalary != null && currency) {
    const amt = parseFloat(exactSalary);
    salary = { min: amt, max: amt, currency: currency.toUpperCase() };
  } else if (salaryType === 'negotiable' && currency) {
    // Preserve selected currency for negotiable postings by storing currency on the salary object.
    salary = { currency: String(currency).toUpperCase() };
  } else if (salaryRange) {
    const parts = salaryRange
      .replace(/[$,]/g, "")
      .split("-")
      .map((p) => p.trim());
    if (parts.length === 2) {
      const min = parseFloat(parts[0]),
        max = parseFloat(parts[1]);
      if (!isNaN(min) && !isNaN(max)) {
        salary = { min, max, currency: "USD" };
      }
    }
  }

  // Normalize to annual
  const factorByPeriod = (p) => {
    if (p === 'year') return 1;
    if (p === 'month') return 12;
    if (p === 'day') return 260; // approx working days/year
    if (p === 'hour') return 2080; // 40h * 52w
    return 1;
  };
  let salaryNormalizedAnnual = null;
  try {
    const f = factorByPeriod(payPeriod);
    if (salaryType === 'range' && salary?.min != null && salary?.max != null) {
      const avg = (Number(salary.min) + Number(salary.max)) / 2;
      salaryNormalizedAnnual = Math.round(avg * f);
    } else if (salaryType === 'exact' && salary?.min != null) {
      salaryNormalizedAnnual = Math.round(Number(salary.min) * f);
    }
  } catch {}

  try {
    console.debug('[debug] createJob payload remoteOption (raw):', req.body?.remoteOption, 'coerced:', remoteOption);
    console.debug('[debug] createJob payload currency:', req.body?.currency, 'salaryType:', salaryType, 'computed salary object:', salary);

    const job = new Job({
      jobTitle,
      description,
      jobType,
      location,
      industry: industry._id, // Use ObjectId reference
      remoteOption,
      skills: skillsArray,
      experienceLevel,
      applicationDeadline,
      salary,
      salaryType,
      payPeriod,
      salaryNormalizedAnnual,
      contactEmail,
      companyId,
      status: "Open",
      benefits: benefits
        ? benefits
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      responsibilities: responsibilities
        ? responsibilities
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      qualifications: qualifications
        ? qualifications
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    });

    await job.save();

   
    // 🔔 Notify users with matching skills (>=30% overlap)
    // Efficient approach: resolve Skill IDs for jobSkills, query profiles that have any of these skills,
    // compute overlap locally, and enqueue notifications + emails for matches >= 30%.
    const notifications = [];
    const emailJobs = [];

    // Only attempt skill-match notifications when the job lists skills
    if (skillsArray.length > 0) {
      // Find Skill docs matching any of the job skills (case-insensitive)
      const skillRegexes = skillsArray.map((s) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));
      let skillDocs = await Skill.find({ name: { $in: skillRegexes } }).lean();
      const foundNames = new Set(skillDocs.map(s => (s.name || '').toLowerCase()));

      // Auto-create missing Skill docs for any job skill names that don't exist yet
      const missingSkillNames = skillsArray.filter(s => !foundNames.has(s.toLowerCase()));
      if (missingSkillNames.length > 0) {
        try {
          const created = [];
          for (const name of missingSkillNames) {
            const trimmed = String(name).trim();
            if (!trimmed) continue;
            // Check again case-insensitively to avoid duplicates
            const exists = await Skill.findOne({ name: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}$`, 'i') });
            if (exists) {
              created.push(exists);
              continue;
            }
            const sdoc = await new Skill({ name: trimmed }).save();
            created.push(sdoc);
          }
          if (created.length > 0) {
            skillDocs = skillDocs.concat(created.map(c => ({ _id: c._id, name: c.name })));
          }
        } catch (err) {
          console.warn('[skills] Failed to auto-create some skills:', err?.message || err);
        }
      }

      const skillIdSet = new Set(skillDocs.map((s) => s._id.toString()));

      if (skillDocs.length > 0) {
        // Query profiles that have at least one of the matching skill IDs
        const candidateProfiles = await UserProfile.find({ skills: { $in: Array.from(skillIdSet) } })
          .populate('skills')
          .populate({ path: 'user', select: 'email name' })
          .lean();

        const jobSkillCount = skillsArray.length;
        const companyNameDoc = await CompanyProfile.findOne({ company: companyId }).select('companyName').lean();
        const companyName = companyNameDoc?.companyName || 'A company';

        for (const profile of candidateProfiles) {
          const userId = profile.user;
          const userEmail = profile.user?.email;
          const userName = profile.user?.name || profile.name || '';

          // Compute overlap between job skills and profile skills (by name lowercased)
          const profileSkillNames = (profile.skills || []).map(s => (s.name || '').toLowerCase());
          const jobSkillNamesLower = skillsArray.map(s => s.toLowerCase());
          const overlap = profileSkillNames.filter(s => jobSkillNamesLower.includes(s)).length;
          const matchPercent = jobSkillCount > 0 ? overlap / jobSkillCount : 0;

          if (matchPercent >= 0.3) {
            // Prepare notification object consistent with Notification model
            notifications.push({
              userId: userId,
              companyId: companyId,
              type: 'new_job_posted',
              title: `New job: ${job.jobTitle}`,
              message: `A new job matching your skills was posted: ${job.jobTitle} at ${companyName}`,
              data: { jobId: job._id, actionUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/jobs/${job._id}`, metadata: { matchPercent: Math.round(matchPercent * 100) } },
              priority: 'high',
            });

            // Queue an email job if the user has an email
            if (userEmail) {
              emailJobs.push({
                to: userEmail,
                subject: `New job matching your skills: ${job.jobTitle}`,
                template: 'jobMatch',
                data: {
                  name: userName,
                  jobTitle: job.jobTitle,
                  companyName,
                  jobUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/jobs/${job._id}`,
                },
              });
            }
          }
        }
      }
    }

    // Enqueue notifications and emails using existing queues (non-blocking)
    // Enqueue notifications and emails using existing queues (non-blocking)
    if (notifications.length > 0) {
      try {
        notificationQueue.add('sendNotifications', { notifications }, { removeOnComplete: true, removeOnFail: true }).catch(async (err) => {
          console.warn('[queue] notificationQueue.add failed, falling back to direct insert:', err?.message || err);
          // Fallback: insert directly and emit
          try {
            const inserted = await Notification.insertMany(notifications);
            const { emitNotification } = await import('../socket.js');
            inserted.forEach(notif => emitNotification(notif.userId || notif.user, notif));
          } catch (ie) {
            console.error('[fallback] Failed to insert notifications directly:', ie?.message || ie);
          }
        });
      } catch (e) {
        console.warn('[queue] Skipping queued notifications — attempting direct insert');
        try {
          const inserted = await Notification.insertMany(notifications);
          const { emitNotification } = await import('../socket.js');
          inserted.forEach(notif => emitNotification(notif.userId || notif.user, notif));
        } catch (ie) {
          console.error('[fallback] Failed to insert notifications directly:', ie?.message || ie);
        }
      }
    }

    if (emailJobs.length > 0) {
      try {
        for (const jobData of emailJobs) {
          emailQueue.add('sendEmail', jobData, { removeOnComplete: true, removeOnFail: true }).catch(async (err) => {
            console.warn('[queue] emailQueue.add failed, sending email directly:', err?.message || err);
            try {
              const { sendEmail } = await import('../utils/emailService.js');
              await sendEmail(jobData.to, jobData.subject, jobData.template, jobData.data);
            } catch (ie) {
              console.error('[fallback] Failed to send email directly:', ie?.message || ie);
            }
          });
        }
      } catch (e) {
        console.warn('[queue] Skipping queued emails — attempting direct send');
        for (const jobData of emailJobs) {
          try {
            const { sendEmail } = await import('../utils/emailService.js');
            await sendEmail(jobData.to, jobData.subject, jobData.template, jobData.data);
          } catch (ie) {
            console.error('[fallback] Failed to send email directly:', ie?.message || ie);
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      job: job
    });
  } catch (err) {
    // Log failed job post
    console.error(`❌ Job post failed for company ${req.user?._id}:`, err);
    if (typeof logAdminAction === "function") {
      logAdminAction("Job Post Failed", req.user?._id, { error: err.message, body: req.body });
    }
    res.status(500).json({ message: "Server error" });
  }
};

//////////////////////////////
// Get jobs posted by the company
//////////////////////////////
export const getPostedJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ companyId: req.user._id })
      .select('jobTitle jobType applicationDeadline status createdAt location remoteOption')
      .lean();
    const now = new Date();

    // Aggregate application counts in one query
    const jobIds = jobs.map((j) => j._id);
    const counts = await Applicant.aggregate([
      { $match: { jobId: { $in: jobIds } } },
      { $group: { _id: '$jobId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const jobsWithApplicationCount = jobs.map((job) => {
      const expired = job.applicationDeadline && new Date(job.applicationDeadline) < now;
      let effectiveStatus = job.status;
      if (job.status === 'Open' && expired) effectiveStatus = 'DeadlineReached';
      if (job.status === 'Closed') effectiveStatus = 'Closed';
      return {
        ...job,
        applicationCount: countMap.get(job._id.toString()) || 0,
        effectiveStatus,
      };
    });

    res.status(200).json(jobsWithApplicationCount);
  } catch (err) {
    console.error("Error fetching jobs:", err);
    res.status(500).json({ message: "Server error" });
  }
};

//////////////////////////////
// Get job details by ID
//////////////////////////////
export const getJobDetails = async (req, res) => {
  try {
    const jobId = req.params.jobId || req.params.id;
    const job = await Job.findById(jobId).select('-__v').lean();
    if (!job) return res.status(404).json({ message: "Job not found" });

    // If CompanyProfile model is missing, just return fallback:
    if (!CompanyProfile) {
      return res.status(200).json({
        ...job.toObject(),
        companyName: "Unknown Company",
        companyLogo: "/demo.png",
      });
    }

    // Otherwise, look up the CompanyProfile row for this job’s companyId
    const company = await CompanyProfile.findOne({ company: job.companyId })
      .select('companyName logo')
      .lean();

    res.status(200).json({
      ...job,
      companyName: company?.companyName || "Unknown Company",
      companyLogo: company?.logo || "/demo.png",
    });
  } catch (error) {
    console.error("Error fetching job details:", error);
    res.status(500).json({ message: "Server error" });
  }
};

//////////////////////////////
// Update a job (by company)
//////////////////////////////
export const updateJob = async (req, res) => {
  const { error, value } = updateJobSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    console.debug('[debug] updateJob payload remoteOption (raw):', req.body?.remoteOption, 'validated value:', value.remoteOption, 'currency:', value.currency, 'minSalary:', value.minSalary, 'maxSalary:', value.maxSalary);
    // Validate job ID format
    if (!req.params.jobId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid Job ID format" });
    }

    const job = await Job.findOne({
      _id: req.params.jobId,
      companyId: req.user._id,
    }).populate("industry", "name");
    if (!job) return res.status(404).json({ message: "Job not found or unauthorized" });

    // Handle industry update
    if (value.industry) {
      const industry = await Industry.findOne({ name: value.industry });
      if (!industry) {
        return res.status(400).json({ message: "Invalid industry selected" });
      }
      job.industry = industry._id;
      delete value.industry; // Remove from value so it doesn't get set again
    }

    if (value.minSalary != null || value.maxSalary != null || value.currency) {
      const min = value.minSalary != null ? parseFloat(value.minSalary) : null;
      const max = value.maxSalary != null ? parseFloat(value.maxSalary) : null;

      // Ensure salary object exists
      job.salary = job.salary || {};

      // If both min and max are provided and valid, set the full salary object
      if (!isNaN(min) && !isNaN(max) && value.currency) {
        job.salary = { min, max, currency: value.currency.toUpperCase() };
      } else {
        // Otherwise, update whatever parts are present. This allows saving currency for negotiable jobs
        if (value.currency) {
          job.salary.currency = String(value.currency).toUpperCase();
        }
        if (!isNaN(min)) job.salary.min = min;
        if (!isNaN(max)) job.salary.max = max;
      }

      delete value.minSalary;
      delete value.maxSalary;
      delete value.currency;
    }

    // Coerce remoteOption to boolean if provided in update payload
    if (Object.prototype.hasOwnProperty.call(value, 'remoteOption')) {
      job.remoteOption = value.remoteOption === true || String(value.remoteOption) === 'true';
      delete value.remoteOption;
    }

    ["benefits", "responsibilities", "qualifications"].forEach((key) => {
      if (typeof value[key] === "string") {
        job[key] = value[key]
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (Array.isArray(value[key])) {
        job[key] = value[key];
      }
    });

    // Update salary normalization if salary or pay period changed
    if (value.salaryType || value.payPeriod || value.minSalary || value.maxSalary) {
      const factorByPeriod = (p) => {
        if (p === 'year') return 1;
        if (p === 'month') return 12;
        if (p === 'day') return 260;
        if (p === 'hour') return 2080;
        return 1;
      };
      const period = value.payPeriod || job.payPeriod;
      const type = value.salaryType || job.salaryType;
      const f = factorByPeriod(period);
      
      if (type === 'range' && job.salary?.min != null && job.salary?.max != null) {
        const avg = (Number(job.salary.min) + Number(job.salary.max)) / 2;
        job.salaryNormalizedAnnual = Math.round(avg * f);
      } else if (type === 'exact' && job.salary?.min != null) {
        job.salaryNormalizedAnnual = Math.round(Number(job.salary.min) * f);
      }
    }

    Object.keys(value).forEach((key) => {
      if (!["benefits", "responsibilities", "qualifications", "minSalary", "maxSalary", "currency"].includes(key)) {
        job[key] = value[key];
      }
    });

    await job.save();
    
    // Log the update for audit trail
    console.log(`✅ Job updated: ${job._id} by company ${req.user._id}`);
    
    res.status(200).json({ message: "Job updated successfully", job });
  } catch (err) {
    console.error(`❌ Error updating job ${req.params.jobId}:`, err);
    
    // Provide specific error messages
    if (err.name === 'ValidationError') {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: Object.values(err.errors).map(e => e.message) 
      });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ message: "Invalid data format" });
    }
    
    res.status(500).json({ message: "Failed to update job. Please try again." });
  }
};

//////////////////////////////
// Get applicants for a job (company-only)
//////////////////////////////
export const getJobApplicants = async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.jobId,
      companyId: req.user._id,
    }).select('_id').lean();
    if (!job) return res.status(404).json({ message: "Job not found" });

    const applicants = await Applicant.find({
      jobId: req.params.jobId,
    })
      .select('userId status createdAt')
      .populate('userId', 'email')
      .lean();
    res.status(200).json(applicants);
  } catch (err) {
    console.error(`❌ Error fetching applicants for job ${req.params.jobId}:`, err);
    res.status(500).json({ 
      message: "Failed to fetch applicants",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

//////////////////////////////
// Delete a job (company-only)
//////////////////////////////
export const deleteJob = async (req, res) => {
  try {
    if (!req.params.jobId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid Job ID format" });
    }
    
    const job = await Job.findOne({ _id: req.params.jobId });
    if (!job) return res.status(404).json({ message: "Job not found" });
    
    if (job.companyId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized to delete this job" });
    }
    
    // Store job details for logging before deletion
    const jobTitle = job.jobTitle;
    const jobId = job._id;
    // Use findOneAndDelete to trigger cascade delete middleware
    await Job.findOneAndDelete({ _id: req.params.jobId });
    
    // Log successful deletion for audit trail
    console.log(`✅ Job deleted: ${jobId} ("${jobTitle}") by company ${req.user._id}`);
    
    res.status(200).json({ 
      success: true,
      message: "Job and all related data deleted successfully" 
    });
  } catch (err) {
    console.error(`❌ Error deleting job ${req.params.jobId}:`, err);
    res.status(500).json({ 
      message: "Failed to delete job. Please try again.",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

//////////////////////////////
// Get all jobs (public/admin)
//////////////////////////////
export const getAllJobs = async (req, res) => {
  try {
    const jobs = await Job.find()
      .select('jobTitle jobType location industry skills status createdAt applicationDeadline salary salaryType payPeriod companyId salaryNormalizedAnnual remoteOption')
      .populate({ path: 'companyProfile', select: 'companyName logo' })
      .populate({ path: 'industry', select: 'name icon gradient description' })
      .lean();

    const flattened = jobs.map((jobObj) => {
      const industryInfo = jobObj.industry || null;
      return {
        ...jobObj,
        companyName: jobObj.companyProfile?.companyName || 'Unknown Company',
        companyLogo: jobObj.companyProfile?.logo || '/demo.png',
        industry: industryInfo,
        industryName: industryInfo?.name || 'Unknown Industry',
      };
    });
    res.status(200).json(flattened);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).json({ message: "Error fetching jobs" });
  }
};

//////////////////////////////
// Get filtered jobs via query parameters (public)
//////////////////////////////
export const getJobs = async (req, res) => {
  try {
    const {
      search,
      datePosted,
      experience,
      remote,
      jobType,
      industry,
      location,
    } = req.query;
    // CRITICAL: Always filter for Open jobs with valid deadlines
    let query = {
      status: "Open",
      applicationDeadline: { $gte: new Date() }
    };

    if (search) {
      query.$or = [
        { jobTitle: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    if (location) {
      query.location = { $regex: location, $options: "i" };
    }

    if (datePosted && datePosted !== "any") {
      let timeLimit;
      if (datePosted === "24h") timeLimit = Date.now() - 24 * 60 * 60 * 1000;
      else if (datePosted === "week")
        timeLimit = Date.now() - 7 * 24 * 60 * 60 * 1000;
      else if (datePosted === "month")
        timeLimit = Date.now() - 30 * 24 * 60 * 60 * 1000;
      if (timeLimit) query.createdAt = { $gte: new Date(timeLimit) };
    }

    if (experience && experience !== "any") query.experienceLevel = experience;
    if (remote && remote !== "any") query.remoteOption = remote === "true";
    if (jobType && jobType !== "any") query.jobType = jobType;
    if (industry) {
      // Convert industry names to ObjectIds
      const industryNames = industry.split(",");
      const industryDocs = await Industry.find({
        name: { $in: industryNames }
      });
      const industryIds = industryDocs.map(ind => ind._id);
      query.industry = { $in: industryIds };
    }

    // — Do a single find(), then populate only companyProfile and industry —
    const jobs = await Job.find(query)
      .select('jobTitle jobType location industry skills status createdAt applicationDeadline salary salaryType payPeriod companyId salaryNormalizedAnnual experienceLevel remoteOption')
      .sort({ createdAt: -1 })
      .populate({ path: 'companyProfile', select: 'companyName logo' })
      .populate({ path: 'industry', select: 'name icon gradient description' })
      .lean();

    // Flatten each job document so front end always sees companyName + companyLogo + industry info
    const flattened = jobs.map((jobObj) => {

      // Try to read from CompanyProfile first. If it’s missing, use "Unknown Company".
      const profileName =
        jobObj.companyProfile && jobObj.companyProfile.companyName;
      const profileLogo = jobObj.companyProfile && jobObj.companyProfile.logo;

      // Include industry information
      const industryInfo = jobObj.industry || null;

      return {
        ...jobObj,
        companyName: profileName || "Unknown Company",
        companyLogo: profileLogo || "/demo.png",
        industry: industryInfo, // Full industry object
        industryName: industryInfo?.name || "Unknown Industry", // For backward compatibility
      };
    });

    return res.status(200).json(flattened);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return res.status(500).json({ message: "Error fetching jobs" });
  }
};

//////////////////////////////
// Update job status (company-only)
//////////////////////////////
export const updateJobStatus = async (req, res) => {
  // Companies are no longer allowed to change job status directly.
  // Admins can change status via admin endpoints only.
  return res.status(403).json({
    message: "Companies cannot change job status. Please contact an administrator.",
  });
};

//////////////////////////////
// Get jobs by a specific Company ID (public)
//////////////////////////////
export const getJobsByCompanyId = async (req, res) => {
  try {
    const companyProfile = await CompanyProfile.findById(req.params.companyId)
      .select('company companyName logo')
      .lean();
    if (!companyProfile)
      return res.status(404).json({ message: "Company not found" });

    // Return ALL jobs for company so admin/company can see closed & expired
    const jobs = await Job.find({
      companyId: companyProfile.company,
    })
      .select('jobTitle jobType location industry skills status createdAt applicationDeadline salary salaryType payPeriod salaryNormalizedAnnual companyId remoteOption')
      .lean();

    const now = new Date();
    const populated = jobs.map((job) => {
      let effectiveStatus = job.status;
      if (job.status === 'Open' && job.applicationDeadline && new Date(job.applicationDeadline) < now) {
        effectiveStatus = 'DeadlineReached';
      }
      return {
        ...job,
        companyName: companyProfile.companyName || "Unknown Company",
        companyLogo: companyProfile.logo || "/demo.png",
        effectiveStatus,
      };
    });
    res.status(200).json(populated);
  } catch (error) {
    console.error(`❌ Error fetching company jobs for ${req.params.companyId}:`, error);
    res.status(500).json({ 
      message: "Failed to fetch company jobs",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

//////////////////////////////
// Get a single job’s details for a company (company-only)
//////////////////////////////
export const getCompanyJobDetails = async (req, res) => {
  try {
    const job = await Job.findOne({
      _id: req.params.jobId,
      companyId: req.user._id,
    })
      .select('-__v')
      .lean();
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (!CompanyProfile) {
      return res.status(200).json({
        ...job,
        companyName: "Unknown Company",
        companyLogo: "/demo.png",
      });
    }
    const company = await CompanyProfile.findOne({ company: req.user._id })
      .select('companyName logo')
      .lean();
    res.status(200).json({
      ...job,
      companyName: company?.companyName || "Unknown Company",
      companyLogo: company?.logo || "/demo.png",
    });
  } catch (error) {
    console.error("Error fetching company job details:", error);
    res.status(500).json({ message: "Server error" });
  }
};

//////////////////////////////
// Get Jobs with Pagination, Filtering, and Search (Optimized)
//////////////////////////////
export const getJobsPaginated = async (req, res) => {
  try {
    const { page = 1, limit = 20, ...filters } = req.query;
    const pageNum = parseInt(page);
    const requestedLimit = parseInt(limit);
    const maxLimit = 50; // Enforce max limit
    const safeLimit = Math.min(requestedLimit, maxLimit); // Cap at 50
    const skip = (pageNum - 1) * safeLimit;

    const query = buildJobQuery(filters);
    let recommendedScores = new Map(); // Use Map to store scores instead of just IDs
    let keywordWeights = new Map(); // Store keywords for later use
    let userProfile = null; // Store for later use

    // Professional recommendation system (similar to LinkedIn)
    if (filters.userId) {
      try {
        // Get user profile with all relevant data
        userProfile = await UserProfile.findOne({ user: filters.userId })
          .select('skills experienceLevel preferredLocation industry')
          .populate({ path: 'skills', select: 'name' })
          .populate({ path: 'industry', select: 'name' })
          .lean();

        // Get user's search history
        const recentSearches = await Search.find({ user: filters.userId })
          .sort({ createdAt: -1 })
          .limit(50)
          .select('query')
          .lean();

        // Get user's application history to avoid recommending already applied jobs
        const appliedJobIds = await Applicant.find({ userId: filters.userId })
          .select('jobId')
          .lean();
        const appliedIdsSet = new Set(appliedJobIds.map(app => app.jobId?.toString()));

        // Build weighted keyword map
        
        // 1. Skills from profile (highest weight: 20)
        if (userProfile && Array.isArray(userProfile.skills) && userProfile.skills.length > 0) {
          userProfile.skills.forEach((skill) => {
            if (skill?.name) {
              const skillName = skill.name.toLowerCase().trim();
              if (skillName.length > 1) {
                keywordWeights.set(skillName, (keywordWeights.get(skillName) || 0) + 20);
              }
            }
          });
        }

        // 2. Recent searches (weighted by recency: 5-15)
        if (Array.isArray(recentSearches) && recentSearches.length > 0) {
          recentSearches.forEach((search, index) => {
            if (typeof search.query === 'string') {
              const weight = Math.max(5, 15 - Math.floor(index / 5)); // Recent searches have higher weight
              search.query
                .split(/\s+/)
                .map(w => w.trim().toLowerCase())
                .filter(w => w.length > 2) // Filter out very short words
                .forEach((word) => {
                  keywordWeights.set(word, (keywordWeights.get(word) || 0) + weight);
                });
            }
          });
        }

        // 3. Industry preference (if user has preferred industry)
        let preferredIndustryName = null;
        if (userProfile?.industry?.name) {
          preferredIndustryName = userProfile.industry.name.toLowerCase();
        }

        // 4. Experience level preference
        const preferredExperience = userProfile?.experienceLevel?.toLowerCase();

        // 5. Location preference
        const preferredLocation = userProfile?.preferredLocation?.toLowerCase();

        // Calculate recommendations - use approach similar to old system
        // First, find jobs that match keywords using regex (like old system)
        let matchedJobs = [];
        
        if (keywordWeights.size > 0) {
          // Create regex patterns for keywords (like old system)
          const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const keywordRegexes = Array.from(keywordWeights.entries()).map(([keyword, weight]) => {
            try {
              const safe = escapeRegex(keyword);
              const rx = new RegExp(safe, 'i');
              return { regex: rx, weight, keyword: keyword.toLowerCase() };
            } catch {
              return null;
            }
          }).filter(Boolean);

          if (keywordRegexes.length > 0) {
            // Find jobs that match any keyword (like old system)
            matchedJobs = await Job.find({
              status: 'Open',
              applicationDeadline: { $gte: new Date() },
              $or: [
                { jobTitle: { $in: keywordRegexes.map(k => k.regex) } },
                { skills: { $in: keywordRegexes.map(k => k.regex) } }
              ]
            })
              .select('_id jobTitle skills industry experienceLevel location jobType createdAt companyId')
              .populate({ path: 'industry', select: 'name' })
              .lean();
          }
        }
        
        // If no keyword matches found, get recent jobs to recommend (fallback)
        // This ensures users always see some recommendations
        if (matchedJobs.length === 0 && keywordWeights.size === 0) {
          // Get recent jobs (last 30 days) as fallback recommendations
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          matchedJobs = await Job.find({
            status: 'Open',
            applicationDeadline: { $gte: new Date() },
            createdAt: { $gte: thirtyDaysAgo }
          })
            .select('_id jobTitle skills industry experienceLevel location jobType createdAt companyId')
            .populate({ path: 'industry', select: 'name' })
            .sort({ createdAt: -1 })
            .limit(50) // Limit to 50 most recent jobs
            .lean();
        }

        // Also get jobs that match preferences (industry, experience, location) even without keywords
        const preferenceMatches = [];
        if (preferredIndustryName || preferredExperience || preferredLocation) {
          const preferenceQuery = {
            status: 'Open',
            applicationDeadline: { $gte: new Date() },
            $or: []
          };
          
          // For industry, we need to match the industry reference, not the populated name
          // We'll filter after population
          if (preferredExperience) {
            preferenceQuery.$or.push({ experienceLevel: new RegExp(preferredExperience, 'i') });
          }
          if (preferredLocation) {
            preferenceQuery.$or.push({ location: new RegExp(preferredLocation, 'i') });
          }

          if (preferenceQuery.$or.length > 0) {
            const jobs = await Job.find(preferenceQuery)
              .select('_id jobTitle skills industry experienceLevel location jobType createdAt companyId')
              .populate({ path: 'industry', select: 'name' })
              .lean();
            
            // Filter by industry name after population
            if (preferredIndustryName) {
              preferenceMatches.push(...jobs.filter(job => {
                const jobIndustryName = job.industry?.name?.toLowerCase() || '';
                return jobIndustryName.includes(preferredIndustryName);
              }));
            } else {
              preferenceMatches.push(...jobs);
            }
          } else if (preferredIndustryName) {
            // Only industry preference, need to get all and filter
            const allJobs = await Job.find({
              status: 'Open',
              applicationDeadline: { $gte: new Date() }
            })
              .select('_id jobTitle skills industry experienceLevel location jobType createdAt companyId')
              .populate({ path: 'industry', select: 'name' })
              .lean();
            
            preferenceMatches.push(...allJobs.filter(job => {
              const jobIndustryName = job.industry?.name?.toLowerCase() || '';
              return jobIndustryName.includes(preferredIndustryName);
            }));
          }
        }

        // Combine and deduplicate
        const allJobsToScore = new Map();
        [...matchedJobs, ...preferenceMatches].forEach(job => {
          allJobsToScore.set(job._id.toString(), job);
        });

        // Score each job
        for (const job of allJobsToScore.values()) {
          // Skip if user already applied
          if (appliedIdsSet.has(job._id.toString())) {
            continue;
          }

          let score = 0;
          const jobTitleLower = (job.jobTitle || '').toLowerCase();
          const jobSkills = Array.isArray(job.skills) ? job.skills.map(s => s.toLowerCase()) : [];
          const jobIndustryName = job.industry?.name?.toLowerCase() || '';
          const jobExperience = (job.experienceLevel || '').toLowerCase();
          const jobLocation = (job.location || '').toLowerCase();

          // Score based on keyword matches (if we have keywords)
          if (keywordWeights.size > 0) {
            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            for (const [keyword, weight] of keywordWeights.entries()) {
              try {
                const regex = new RegExp(escapeRegex(keyword), 'i');
                // Exact match in job title (highest score)
                if (jobTitleLower === keyword) {
                  score += weight * 3;
                } else if (regex.test(jobTitleLower)) {
                  score += weight * 2;
                }

                // Match in skills
                if (jobSkills.some(skill => {
                  if (skill === keyword) return true;
                  try {
                    return regex.test(skill);
                  } catch {
                    return false;
                  }
                })) {
                  score += weight * 2;
                }
              } catch {
                // Skip invalid regex
              }
            }
          }

          // Industry match bonus (+50 points)
          if (preferredIndustryName && jobIndustryName && jobIndustryName.includes(preferredIndustryName)) {
            score += 50;
          }

          // Experience level match bonus (+30 points)
          if (preferredExperience && jobExperience && jobExperience === preferredExperience) {
            score += 30;
          }

          // Location match bonus (+40 points)
          if (preferredLocation && jobLocation && jobLocation.includes(preferredLocation)) {
            score += 40;
          }

          // Recent job bonus (jobs posted in last 7 days get +20 points)
          const daysSincePosted = (new Date() - new Date(job.createdAt)) / (1000 * 60 * 60 * 24);
          if (daysSincePosted <= 7) {
            score += 20;
          } else if (daysSincePosted <= 30) {
            score += 10;
          }
          
          // If no keywords but job is recent, give it a base score
          // This ensures recommendations work even without profile data
          if (keywordWeights.size === 0 && daysSincePosted <= 30) {
            score = Math.max(score, 15); // Minimum score for recent jobs
          }

          // Mark as recommended if score > 0 (like the old system)
          // Be more lenient: recommend if score > 0 OR if it's a recent job
          if (score > 0 || (daysSincePosted <= 7 && keywordWeights.size === 0)) {
            recommendedScores.set(job._id.toString(), Math.max(score, 1));
          }
        }

        // Log for debugging
        console.log(`📊 Recommendation scores calculated for user ${filters.userId}: ${recommendedScores.size} jobs recommended`);
        console.log(`📋 User profile summary:`, {
          hasSkills: userProfile?.skills?.length > 0,
          skillsCount: userProfile?.skills?.length || 0,
          hasSearches: recentSearches?.length > 0,
          searchesCount: recentSearches?.length || 0,
          hasIndustry: !!userProfile?.industry,
          industryName: userProfile?.industry?.name,
          hasExperience: !!userProfile?.experienceLevel,
          experienceLevel: userProfile?.experienceLevel,
          hasLocation: !!userProfile?.preferredLocation,
          preferredLocation: userProfile?.preferredLocation,
          keywordWeightsSize: keywordWeights.size,
          matchedJobsCount: matchedJobs.length,
          preferenceMatchesCount: preferenceMatches.length
        });
        
        if (recommendedScores.size === 0) {
          console.log(`⚠️ No jobs met the recommendation criteria. This might be because:`);
          console.log(`   - User has no skills or search history`);
          console.log(`   - No jobs match user preferences`);
          console.log(`   - All matching jobs were already applied to`);
          console.log(`   - No recent jobs available (last 30 days)`);
        } else {
          // Show top 5 recommended jobs
          const topRecommended = Array.from(recommendedScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          console.log(`⭐ Top 5 recommended jobs:`, topRecommended.map(([jobId, score]) => ({ jobId, score })));
        }
      } catch (error) {
        console.error('❌ Error calculating recommendations:', error);
        // Continue without recommendations if there's an error
      }
    }

    const sortOptions = filters.sortBy === 'recommended' ? { createdAt: -1 } : { createdAt: -1 };
    const populateOptions = [
      { path: 'companyProfile', select: 'companyName logo' },
      { path: 'industry', select: 'name icon gradient description' },
    ];

    // Get jobs that match the current filters (these are the jobs we'll show)
    const jobs = await getJobsWithPopulation(query, {
      sort: sortOptions,
      skip,
      limit: safeLimit,
      select:
        'jobTitle jobType location industry skills status createdAt applicationDeadline salary salaryType payPeriod companyId salaryNormalizedAnnual experienceLevel remoteOption',
      populate: populateOptions,
      lean: true,
    });
    
    // IMPORTANT: Also calculate recommendations for jobs in the current filtered results
    // This ensures recommended jobs appear even if they match current search/filters
    if (filters.userId && keywordWeights.size > 0) {
      // Check filtered jobs and add recommendations if they match keywords
      for (const job of jobs) {
        const jobIdStr = job._id.toString();
        // If this job is already in recommendedScores, keep it
        // If not, but it matches keywords, add it with a score
        if (!recommendedScores.has(jobIdStr)) {
          const jobTitleLower = (job.jobTitle || '').toLowerCase();
          const jobSkills = Array.isArray(job.skills) ? job.skills.map(s => s.toLowerCase()) : [];
          
          // If job matches any keyword from user's profile/searches, recommend it
          for (const [keyword, weight] of keywordWeights.entries()) {
            if (jobTitleLower.includes(keyword) || 
                jobSkills.some(skill => skill.includes(keyword))) {
              recommendedScores.set(jobIdStr, weight); // Use keyword weight as score
              break;
            }
          }
        }
      }
    }
    
    // Fallback: If no recommendations found and user has no keywords, recommend recent jobs in filtered results
    if (filters.userId && recommendedScores.size === 0 && keywordWeights.size === 0) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      for (const job of jobs) {
        const jobIdStr = job._id.toString();
        const daysSincePosted = (new Date() - new Date(job.createdAt)) / (1000 * 60 * 60 * 24);
        if (daysSincePosted <= 7) {
          recommendedScores.set(jobIdStr, 15); // Base score for recent jobs
        }
      }
    }

    const processedJobs = jobs.map((job) => {
      const jobObj = job && typeof job.toObject === 'function' ? job.toObject() : job;
      const jobIdStr = jobObj._id.toString();
      const isRec = recommendedScores.has(jobIdStr);
      const recommendationScore = recommendedScores.get(jobIdStr) || 0;
      const profileName = jobObj.companyProfile?.companyName || 'Unknown Company';
      const profileLogo = jobObj.companyProfile?.logo || '/demo.png';
      const industryInfo = jobObj.industry || null;

      return {
        ...jobObj,
        isRecommended: isRec,
        recommendationScore: isRec ? recommendationScore : 0, // Include score for sorting
        companyName: profileName,
        companyLogo: profileLogo,
        industry: industryInfo,
        industryName: industryInfo?.name || 'Unknown Industry',
      };
    });

    // Sort recommended jobs first, then by score, then by date
    if (recommendedScores.size > 0) {
      processedJobs.sort((a, b) => {
        // Recommended jobs first
        if (a.isRecommended && !b.isRecommended) return -1;
        if (!a.isRecommended && b.isRecommended) return 1;
        // If both recommended, sort by score (higher score first)
        if (a.isRecommended && b.isRecommended) {
          const scoreDiff = (b.recommendationScore || 0) - (a.recommendationScore || 0);
          if (scoreDiff !== 0) return scoreDiff;
        }
        // Then by date (newest first)
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    } else if (filters.sortBy === 'recommended') {
      processedJobs.sort((a, b) => {
        if (a.isRecommended && !b.isRecommended) return -1;
        if (!a.isRecommended && b.isRecommended) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }

    const totalJobs = await Job.countDocuments(query);
    const response = {
      jobs: processedJobs,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalJobs / safeLimit),
        totalJobs,
        limit: safeLimit,
        hasNextPage: pageNum < Math.ceil(totalJobs / safeLimit),
        hasPrevPage: pageNum > 1,
      },
      filters,
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error in getJobsPaginated:", error);
    return sendErrorResponse(res, 'serverError', 500, { error: error.message });
  }
};

// Add this helper function before the getRecommendedAndAllJobs function
const getUserKeywordsWithWeight = async (userId) => {
  try {
    const profile = await UserProfile.findOne({ user: userId }).populate("skills");
    const searches = await Search.find({ user: userId }).sort({ createdAt: -1 }).limit(50); // Limit to recent searches

    const keywordWeights = new Map();

    // Add skills with high weight (10)
    if (profile && Array.isArray(profile.skills)) {
      profile.skills.forEach((skill) => {
        if (skill.name) {
          const skillName = skill.name.toLowerCase();
          keywordWeights.set(skillName, (keywordWeights.get(skillName) || 0) + 10);
        }
      });
    }

    // Add search terms with decreasing weights based on recency
    if (Array.isArray(searches)) {
      searches.forEach((search, index) => {
        if (typeof search.query === "string") {
          const weightFactor = Math.max(1, 5 - Math.floor(index / 10)); // Recent searches have higher weight
          search.query
            .split(" ")
            .map((w) => w.trim().toLowerCase())
            .filter(Boolean)
            .filter(word => word.length > 1) // Filter out single characters
            .forEach((word) => {
              keywordWeights.set(word, (keywordWeights.get(word) || 0) + weightFactor);
            });
        }
      });
    }

    // Convert to array and sort by weight (descending)
    const sortedKeywords = Array.from(keywordWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50); // Limit to top 50 keywords

    return sortedKeywords;
  } catch (err) {
    console.error("Error getting user keywords with weight:", err);
    return [];
  }
};

// Keep the original getRecommendedAndAllJobs function for backward compatibility
export const getRecommendedAndAllJobs = async (req, res) => {
  try {
    const userId = req.user?._id || null;
    const recommendedScores = new Map(); // Store job scores instead of just IDs

    // 1) If user is logged in, build their "keywords" with weights from profile.skills + past searches
    if (userId) {
      const weightedKeywords = await getUserKeywordsWithWeight(userId);
      
      if (weightedKeywords.length > 0) {
        // Create regex patterns for all keywords
        const escapeRegex2 = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const keywordRegexes = weightedKeywords.map(([keyword, weight]) => {
          let safe = keyword;
          try {
            safe = escapeRegex2(keyword);
            const rx = new RegExp(safe, 'i');
            return { regex: rx, weight, keyword: keyword.toLowerCase() };
          } catch {
            return null;
          }
        }).filter(Boolean);
        
        // Find jobs that match any of the keywords
        const matchedJobs = await Job.find({
          status: "Open",
          applicationDeadline: { $gte: new Date() },
          $or: [
            { jobTitle: { $in: keywordRegexes.map(k => k.regex) } }, 
            { skills: { $in: keywordRegexes.map(k => k.regex) } }
          ],
        }).select("_id jobTitle jobType skills");

        // Score each matched job based on keyword weights
        for (const job of matchedJobs) {
          let score = 0;
          
          // Check job title matches
          const jobTitleLower = job.jobTitle.toLowerCase();
          for (const { regex, weight, keyword } of keywordRegexes) {
            if (regex.test(jobTitleLower)) {
              // Exact matches in title get higher weight
              if (jobTitleLower === keyword) {
                score += weight * 3;
              } else if (jobTitleLower.includes(keyword)) {
                score += weight * 2;
              } else {
                score += weight;
              }
            }
          }
          
          // Check skill matches
          if (Array.isArray(job.skills)) {
            for (const skill of job.skills) {
              const skillLower = skill.toLowerCase();
              for (const { regex, weight, keyword } of keywordRegexes) {
                if (regex.test(skillLower)) {
                  // Exact matches in skills get higher weight
                  if (skillLower === keyword) {
                    score += weight * 2;
                  } else if (skillLower.includes(keyword)) {
                    score += weight;
                  }
                }
              }
            }
          }
          
          recommendedScores.set(job._id.toString(), score);
        }
      }
    }

    // 2) Fetch ALL open jobs, sorted by creation date descending.
    //    Populate only `companyProfile` virtual and industry
    let allJobs = await Job.find({
      status: "Open",
      applicationDeadline: { $gte: new Date() },
    })
      .sort({ createdAt: -1 })
      .select('jobTitle jobType location industry skills status createdAt applicationDeadline salary salaryType payPeriod salaryNormalizedAnnual companyId experienceLevel remoteOption')
      .populate({
        path: "companyProfile", // virtual defined in Job schema
        select: "companyName logo",
      })
      .populate({
        path: "industry", // populate industry data
        select: "name icon gradient description",
      })
      .lean();

    // 3) Map each job → plain object, add `isRecommended` and score, pick name/logo and industry info
    const jobsWithFlags = allJobs.map((jobObj) => {
      const score = recommendedScores.get(jobObj._id.toString()) || 0;
      const isRecommended = score > 0;

      // If companyProfile exists, use it. Otherwise: "Unknown Company"
      const profileName =
        jobObj.companyProfile && jobObj.companyProfile.companyName;
      const profileLogo = jobObj.companyProfile && jobObj.companyProfile.logo;

      // Include industry information
      const industryInfo = jobObj.industry || null;

      return {
        ...jobObj,
        isRecommended: isRecommended,
        recommendationScore: score, // Add score for sorting
        companyName: profileName || "Unknown Company",
        companyLogo: profileLogo || "/demo.png",
        industry: industryInfo, // Full industry object
        industryName: industryInfo?.name || "Unknown Industry", // For backward compatibility
      };
    });

    // 4) Sort so that recommended jobs come first, sorted by score, then by createdAt desc
    jobsWithFlags.sort((a, b) => {
      // First, prioritize jobs with higher recommendation scores
      if (a.recommendationScore > 0 || b.recommendationScore > 0) {
        if (a.recommendationScore !== b.recommendationScore) {
          return b.recommendationScore - a.recommendationScore; // Higher scores first
        }
        // If scores are equal, fall back to date sorting
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      
      // For non-recommended jobs, sort by creation date
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // 5) Return the final array of jobs
    return res.status(200).json(jobsWithFlags);
  } catch (err) {
    console.error("[jobController] Error in getRecommendedAndAllJobs:", err);
    return res
      .status(500)
      .json({ message: "Failed to load jobs. Please try again later." });
  }
};
