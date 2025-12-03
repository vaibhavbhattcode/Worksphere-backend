// controllers/companyApplicationController.js
import Applicant from "../models/Application.js";
import Job from "../models/Job.js"; // import Job to fetch company jobs
import UserProfile from "../models/UserProfile.js"; // <-- Import the UserProfile model
import { createNotification } from "./notificationController.js";
const getBackendUrl = () => process.env.BACKEND_URL || "http://localhost:5000";

// Optimized function for a single job's applications
export const getJobApplications = async (req, res) => {
  let { jobId } = req.params;
  // If jobId is an object, extract _id
  if (typeof jobId === 'object' && jobId !== null && jobId._id) {
    jobId = jobId._id;
  }
  // If jobId is a stringified object, try to parse and extract _id
  if (typeof jobId === 'string' && jobId.startsWith('{') && jobId.endsWith('}')) {
    try {
      const parsed = JSON.parse(jobId);
      if (parsed && parsed._id) jobId = parsed._id;
    } catch (e) { /* ignore */ }
  }
  // Validate jobId is a valid 24-character hex string
  if (typeof jobId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(jobId)) {
    return res.status(400).json({ message: 'Invalid jobId format' });
  }
  try {
    const applications = await Applicant.find({ jobId })
      .populate("userId", "email")
      .populate({ path: 'jobId', select: 'jobTitle companyId' })
      .lean();

    // Filter out applications with missing userId
    const filteredApps = applications.filter(app => app.userId && app.userId._id);

    if (filteredApps.length === 0) {
      return res.status(200).json([]);
    }

    // Batch fetch all UserProfiles with name
    const userIds = filteredApps.map(app => app.userId._id);
    const profiles = await UserProfile.find({ user: { $in: userIds } })
      .populate('skills', 'name')
      .select('user name title location phone skills profileImage resume')
      .lean();

    // Create profile Map for fast lookup
    const profileMap = new Map();
    profiles.forEach(profile => {
      profileMap.set(profile.user.toString(), {
        name: profile.name,
        title: profile.title,
        location: profile.location,
        phone: profile.phone,
        profileImage: profile.profileImage,
        resume: profile.resume,
        skills: profile.skills ? profile.skills.map(s => 
          typeof s === 'object' && s.name ? s.name : s
        ) : []
      });
    });

    const backendUrl = getBackendUrl();

    // Merge data efficiently
    const populatedApps = filteredApps.map(app => {
      let mergedUser = { ...app.userId };
      const actualUserId = app.userId._id;
      const profileData = profileMap.get(actualUserId.toString());
      
      if (profileData) {
        mergedUser = { ...mergedUser, ...profileData, _id: actualUserId };
      }

      let resumeUrl = mergedUser.resume || app.resume;
      if (resumeUrl && resumeUrl.startsWith("/")) {
        resumeUrl = `${backendUrl}${resumeUrl}`;
      }
      mergedUser.resume = resumeUrl;

      return { ...app, userId: mergedUser };
    });

    return res.status(200).json(populatedApps);
  } catch (err) {
    console.error("Error fetching applications:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
// NEW: Get all applications for all jobs posted by the company (Optimized)
export const getAllApplicationsForCompany = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized: Company not logged in" });
    }

    // Fetch job IDs for company
    const jobs = await Job.find({ companyId: req.user._id }).select("_id jobTitle").lean();
    const jobIds = jobs.map((job) => job._id);

    if (jobIds.length === 0) {
      return res.status(200).json([]);
    }

    // Optimized: Single query with all necessary population
    const applications = await Applicant.find({ jobId: { $in: jobIds } })
      .select("_id jobId userId status resume coverLetter createdAt")
      .populate({
        path: "userId",
        select: "email",
        options: { lean: true }
      })
      .populate({
        path: "jobId",
        select: "jobTitle",
        options: { lean: true }
      })
      .lean();

    if (applications.length === 0) {
      return res.status(200).json([]);
    }

    // Filter and batch fetch UserProfiles with name
    const validApps = applications.filter(app => app.userId && app.userId._id);
    if (validApps.length === 0) {
      return res.status(200).json([]);
    }

    const userIds = validApps.map(app => app.userId._id);
    const profiles = await UserProfile.find({ user: { $in: userIds } })
      .populate('skills', 'name')
      .select('user name title location phone skills profileImage resume')
      .lean();

    // Create profile Map for fast lookup
    const profileMap = new Map();
    profiles.forEach(profile => {
      profileMap.set(profile.user.toString(), {
        name: profile.name,
        title: profile.title,
        location: profile.location,
        phone: profile.phone,
        profileImage: profile.profileImage,
        resume: profile.resume,
        skills: profile.skills ? profile.skills.map(s => 
          typeof s === 'object' && s.name ? s.name : s
        ) : []
      });
    });

    const backendUrl = getBackendUrl();

    // Merge user data with profile data
    const populatedApps = validApps.map(app => {
      let mergedUser = { ...app.userId };
      const actualUserId = app.userId._id;
      const profileData = profileMap.get(actualUserId.toString());
      
      if (profileData) {
        mergedUser = { ...mergedUser, ...profileData, _id: actualUserId };
      }

      let resumeUrl = mergedUser.resume || app.resume;
      if (resumeUrl && resumeUrl.startsWith("/")) {
        resumeUrl = `${backendUrl}${resumeUrl}`;
      }
      mergedUser.resume = resumeUrl;

      return { ...app, userId: mergedUser };
    });

    return res.status(200).json(populatedApps);
  } catch (err) {
    console.error("Error fetching all applications:", err);
    return res.status(500).json({ message: "Server error" });
  }
}


import sendEmail from "../utils/sendEmail.js";
import templates from "../utils/emailTemplates.js";

export const updateApplicationStatus = async (req, res) => {
  const { applicationId } = req.params;
  const { status } = req.body;

  // Validate status: allow all valid statuses used in the app
  const allowedStatuses = ["hired", "rejected", "shortlisted", "interviewed", "pending"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status value" });
  }

  try {
    let application = await Applicant.findById(applicationId)
      .populate("userId", "email")
      .populate("jobId", "jobTitle companyId");
    // Defensive: if populate didn't return jobId or userId, re-fetch minimal data
    if (application && (!application.userId || !application.userId._id || !application.jobId)) {
      application = await Applicant.findById(applicationId).lean();
      if (application) {
        // attach userId and jobId documents if possible
        if (!application.userId) {
          const rawApp = await Applicant.findById(applicationId).select('userId').populate('userId', 'email').lean();
          if (rawApp?.userId) application.userId = rawApp.userId;
        }
        if (!application.jobId) {
          const rawJob = await Job.findById(application.jobId).select('jobTitle companyId').lean();
          if (rawJob) application.jobId = rawJob;
        }
      }
    }
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    // Get user name from UserProfile
    const userProfile = await UserProfile.findOne({ user: application.userId._id }).select('name').lean();
    const userName = userProfile?.name || "Applicant";
    
    const oldStatus = application.status;
    application.status = status;
    await application.save();

    // Send email notification based on status
    const userEmail = application.userId.email;
    const jobTitle = application.jobId?.jobTitle || "the position";
    
    try {
      const { subject, html } = templates.applicationStatus({
        name: userName,
        companyName: "the company",
        jobTitle,
        status,
      });
      await sendEmail(userEmail, subject, undefined, html);
      console.log(`Status update email sent to ${userEmail}`);
    } catch (emailErr) {
      console.error("Error sending status update email:", emailErr);
    }

    // 🔔 Create notification for applicant about status change
    if (oldStatus !== status) {
      const notificationTypes = {
        hired: "application_accepted",
        rejected: "application_rejected",
        shortlisted: "application_viewed",
        interviewed: "interview_scheduled"
      };

      const notificationMessages = {
        hired: `Congratulations! Your application for ${jobTitle} has been accepted.`,
        rejected: `Your application for ${jobTitle} was not selected this time.`,
        shortlisted: `Your application for ${jobTitle} is being reviewed.`,
        interviewed: `You have been selected for an interview for ${jobTitle}.`
      };

      // Notify applicant
      // Notify applicant
      const applicantIdForNotif = application.userId?._id || (application.userId || null);
      const companyIdForNotif = application.jobId?.companyId || null;
      // notify applicant (user recipient)
      await createNotification({
        userId: applicantIdForNotif,
        type: notificationTypes[status] || "company_response",
        title: `Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: notificationMessages[status] || `Your application status was updated to ${status}.`,
        data: {
          jobId: application.jobId?._id,
          applicationId: application._id,
          companyId: companyIdForNotif,
          actionUrl: `/applications/${application._id}`
        },
        priority: status === "hired" ? "urgent" : status === "rejected" ? "high" : "medium"
      });

      // Notify company
      const applicantIdForNotif2 = application.userId?._id || (application.userId || null);
      // notify company (company recipient)
      await createNotification({
        companyId: companyIdForNotif,
        type: notificationTypes[status] || "company_response",
        title: `Application ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Application for ${jobTitle} by ${userName} is now marked as ${status}.`,
        data: {
          jobId: application.jobId?._id,
          applicationId: application._id,
          userId: applicantIdForNotif2,
          actionUrl: `/company/applications`
        },
        priority: status === "hired" ? "urgent" : status === "rejected" ? "high" : "medium"
      });
    }

    return res
      .status(200)
      .json({ message: `Application ${status} successfully`, application });
  } catch (err) {
    console.error("Error updating application status:", err);
    return res.status(500).json({ message: "Server error" });
  }

};