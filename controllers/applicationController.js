// controllers/applicationController.js
import Application from "../models/Application.js";
import UserProfile from "../models/UserProfile.js";
import Job from "../models/Job.js";
import CompanyProfile from "../models/CompanyProfile.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { createNotification } from "./notificationController.js";
import sendEmail from "../utils/sendEmail.js";
import templates from "../utils/emailTemplates.js";

export const submitApplication = async (req, res) => {
  try {
    const { jobId, coverLetter } = req.body;
    if (!jobId) {
      return res.status(400).json({ message: "Job ID is required." });
    }
    if (!req.user || !req.user._id) {
      return res
        .status(401)
        .json({ message: "Unauthorized: User not logged in" });
    }
    const userId = req.user._id;
    // Fetch profile and job in parallel
    const [profile, job] = await Promise.all([
      UserProfile.findOne({ user: userId }).select('resume').lean(),
      Job.findById(jobId).select('jobTitle companyId').lean()
    ]);
    const resume = profile?.resume || "";
    const application = new Application({ jobId, userId, coverLetter, resume });
    await application.save();
    let companyName = "the company";
    let user = null;
    if (job && job.companyId) {
      // Fetch company profile and user in parallel
      const [companyProfile, userDoc] = await Promise.all([
        CompanyProfile.findOne({ company: job.companyId }).select('companyName').lean(),
        User.findById(userId).select('name email').lean()
      ]);
      if (companyProfile && companyProfile.companyName) {
        companyName = companyProfile.companyName;
      }
      user = userDoc;
      
      // 📧 Send confirmation email to user
      if (user && user.email) {
        try {
          const { subject, html } = templates.applicationSubmitted({
            name: user.name,
            companyName,
            jobTitle: job.jobTitle,
            applicationId: application._id,
            jobId: job._id
          });
          await sendEmail(user.email, subject, undefined, html);
          console.log(`Application confirmation email sent to ${user.email}`);
        } catch (emailErr) {
          console.error("Error sending application email:", emailErr);
        }
      }

      // 🔔 Create notification for user - application submitted
      await createNotification({
        userId,
        type: "application_submitted",
        title: "Application Submitted",
        message: `You successfully applied for ${job.jobTitle} at ${companyName}.`,
        data: {
          jobId: job._id,
          applicationId: application._id,
          companyId: job.companyId,
          actionUrl: `/job/${job._id}`
        },
        priority: "medium"
      });

      // 🔔 Create notification for company - new application received
      await createNotification({
        companyId: job.companyId,
        type: "application_submitted",
        title: "New Application Received",
        message: `New application for ${job.jobTitle} from ${user?.name || 'a candidate'}`,
        data: {
          jobId: job._id,
          applicationId: application._id,
          actionUrl: `/company/applications`
        },
        priority: "high"
      });
    }

    return res
      .status(201)
      .json({ message: "Application submitted successfully", application });
  } catch (err) {
    console.error("Error submitting application:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getApplicationsForJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const applications = await Application.find({ jobId })
      .select('userId status coverLetter resume createdAt')
      .populate('userId', 'email name')
      .lean();
    return res.status(200).json(applications);
  } catch (err) {
    console.error("Error fetching applications:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getUserApplication = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(404).json({ message: "No application found" });
    }
    if (!req.user || !req.user._id) {
      return res
        .status(401)
        .json({ message: "Unauthorized: User not logged in" });
    }
    const userId = req.user._id;
    const application = await Application.findOne({ jobId, userId })
      .select('jobId userId status coverLetter resume createdAt')
      .lean();
    if (!application) {
      return res.status(404).json({ message: "No application found" });
    }
    return res.status(200).json(application);
  } catch (err) {
    console.error("Error fetching user application:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getAllUserApplications = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const applications = await Application.find({ userId: req.user._id })
      .select('jobId status createdAt')
      .lean();
    return res.status(200).json(applications);
  } catch (err) {
    console.error("Error fetching all user applications:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getAppliedJobs = async (req, res) => {
  try {
    const userId = req.user._id;
    const applications = await Application.find({ userId })
      .select('jobId createdAt status')
      .sort({ createdAt: -1 })
      .lean();
    if (applications.length === 0) {
      return res.status(200).json({ jobs: [] });
    }
    const jobIds = applications.map((a) => a.jobId);
    const jobs = await Job.find({ _id: { $in: jobIds } })
      .select('jobTitle location industry skills status createdAt applicationDeadline salary salaryType payPeriod salaryNormalizedAnnual companyId')
      .populate({ path: 'companyProfile', select: 'companyName logo' })
      .lean();
    const result = jobs.map((job) => ({
      ...job,
      companyName: job.companyProfile?.companyName || 'Unknown Company',
      companyLogo:
        job.companyProfile?.logo && job.companyProfile.logo.trim() !== ''
          ? job.companyProfile.logo
          : '/demo.png',
    }));
    return res.status(200).json({ jobs: result });
  } catch (error) {
    console.error("Error fetching applied jobs:", error);
    return res
      .status(500)
      .json({ message: "Error fetching applied jobs", error: error.message });
  }
};
