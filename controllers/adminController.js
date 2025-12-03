import User from "../models/User.js";
import Company from "../models/Company.js";
import Job from "../models/Job.js";
import { getEffectiveStatus, annotateJobWithEffectiveStatus } from "../utils/jobStatus.js";
import { emitJobUpdate } from "../socket.js";
import logAdminAction from "../utils/logAdminAction.js";
import sendEmail from "../utils/sendEmail.js";
import templates from "../utils/emailTemplates.js";

// Helper function to map job status from backend to frontend
const mapJobStatus = (backendStatus) => {
  const statusMap = {
    "Open": "approved",
    "Closed": "expired",
  };
  return statusMap[backendStatus] || "pending";
};

const adminController = {
  // Fetch dashboard stats
  getStats: async (req, res) => {
    try {
      const userCount = await User.countDocuments();
      const companyCount = await Company.countDocuments();
      const jobCount = await Job.countDocuments();
      
      // Count active jobs (status: Open and NOT expired by deadline)
      const now = new Date();
      // Open (not expired)
      const openJobsCount = await Job.countDocuments({
        status: "Open",
        $or: [
          { applicationDeadline: null },
          { applicationDeadline: { $gte: now } }
        ]
      });
      // Deadline reached (expired but stored status still Open)
      const deadlineReachedCount = await Job.countDocuments({
        status: "Open",
        applicationDeadline: { $lt: now }
      });
      // Closed (manually closed)
      const closedJobsCount = await Job.countDocuments({ status: "Closed" });

      res.json({
        users: userCount || 0,
        companies: companyCount || 0,
        jobs: jobCount || 0,
        openJobs: openJobsCount || 0,
        deadlineReachedJobs: deadlineReachedCount || 0,
        closedJobs: closedJobsCount || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({
        message: "Error fetching stats",
        error,
        users: 0,
        companies: 0,
        jobs: 0,
        openJobs: 0,
        deadlineReachedJobs: 0,
        closedJobs: 0
      });
    }
  },

  // User Management
  getAllUsers: async (req, res) => {
    try {
      const { search, status, sortBy, sortOrder, limit } = req.query;

      const query = {};

      if (search) {
        const regex = new RegExp(search, "i");
        query.$or = [
          { email: regex },
          { role: regex },
          { isAdmin: search.toLowerCase() === "admin" ? true : false },
        ];
      }

      // Always filter role to jobSeeker to exclude admins
      query.role = "jobSeeker";

      if (status) {
        if (status.toLowerCase() === "active") {
          query.isActive = true;
        } else if (status.toLowerCase() === "deactivated") {
          query.isActive = false;
        }
      }

      const sortOptions = {};
      if (sortBy) {
        sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
      } else {
        sortOptions.createdAt = -1;
      }

      const pageSize = parseInt(limit, 10);

      // Fetch all users (limit=0) or apply limit if specified
      let usersQuery = User.find(query).sort(sortOptions);
      if (pageSize > 0) {
        usersQuery = usersQuery.limit(pageSize);
      }
      const users = await usersQuery;

      // Get the filtered total count
      const filteredTotalUsers = await User.countDocuments(query);

      // Get the real total counts from the entire database (excluding admins)
      const baseQuery = { role: "jobSeeker" };
      const totalUsersCount = await User.countDocuments(baseQuery);
      const totalActiveUsers = await User.countDocuments({ ...baseQuery, isActive: true });
      const totalInactiveUsers = await User.countDocuments({ ...baseQuery, isActive: false });

      const UserProfile = (await import("../models/UserProfile.js")).default;
      const Skill = (await import("../models/Skill.js")).default;
      const Education = (await import("../models/Education.js")).default;
      const Experience = (await import("../models/Experience.js")).default;

      const userIds = users.map((u) => u._id);
      const profiles = await UserProfile.find({
        user: { $in: userIds },
      })
        .select("user name title location phone about skills socialLinks profileImage resume resumeName videoIntroduction")
        .populate("skills", "name")
        .lean();
      const educations = await Education.find({
        user: { $in: userIds },
      })
        .select("user institution degree fieldOfStudy startDate endDate description")
        .lean();
      const experiences = await Experience.find({
        user: { $in: userIds },
      })
        .select("user company role startDate endDate description")
        .lean();

      const profileMap = {};
      profiles.forEach((profile) => {
        profileMap[String(profile.user)] = profile;
      });

      const educationMap = {};
      educations.forEach((edu) => {
        const key = String(edu.user);
        if (!educationMap[key]) {
          educationMap[key] = [];
        }
        educationMap[key].push(edu);
      });

      const experienceMap = {};
      experiences.forEach((exp) => {
        const key = String(exp.user);
        if (!experienceMap[key]) {
          experienceMap[key] = [];
        }
        experienceMap[key].push(exp);
      });

      const usersWithProfile = users.map((user) => {
        const userId = user._id.toString();
        const profile = profileMap[userId] || {};
        profile.education = educationMap[userId] || [];
        profile.experience = experienceMap[userId] || [];
        return {
          ...user.toObject(),
          profile,
        };
      });

      res.json({
        users: usersWithProfile,
        total: filteredTotalUsers,
        realTotals: {
          totalUsers: totalUsersCount,
          activeUsers: totalActiveUsers,
          inactiveUsers: totalInactiveUsers,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching users", error });
    }
  },

  updateUser: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const user = await User.findByIdAndUpdate(id, updates, { new: true });
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Error updating user", error });
    }
  },

  deleteUser: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || req.user?._id;

      const user = await User.findOneAndDelete({ _id: id });

      await logAdminAction("Delete User", adminId, { userId: id });

      if (user) {
        const { subject, html } = templates.accountDeleted({ name: user.name, actor: 'Account' });
        await sendEmail(user.email, subject, undefined, html);
      }

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting user", error });
    }
  },

  toggleUserActive: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || req.user?._id;

      const user = await User.findById(id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const previousStatus = user.isActive;
      user.isActive = !user.isActive;
      await user.save();

      await logAdminAction(
        user.isActive ? "Activate User" : "Deactivate User",
        adminId,
        { userId: id }
      );

      if (previousStatus !== user.isActive) {
        const { subject, html } = templates.accountStatus({ name: user.name || user.email.split('@')[0], isActive: user.isActive, actor: 'Account' });
        sendEmail(user.email, subject, undefined, html).catch((emailError) => {
          console.error("Failed to send activation email:", emailError);
        });
      }

      res.json({
        message: `User ${
          user.isActive ? "activated" : "deactivated"
        } successfully`,
        isActive: user.isActive,
      });
    } catch (error) {
      res.status(500).json({ message: "Error toggling user status", error });
    }
  },

  getUserGrowth: async (req, res) => {
    try {
      const { interval = "monthly", date, month, year } = req.query;
      let match = {};
      let groupBy;
      let labels = [];
      if (interval === "hourly") {
        const selectedDate = date ? new Date(date) : new Date();
        const start = new Date(selectedDate.setHours(0, 0, 0, 0));
        const end = new Date(selectedDate.setHours(23, 59, 59, 999));
        match = { createdAt: { $gte: start, $lte: end } };
        groupBy = { $hour: "$createdAt" };
        labels = Array.from({ length: 24 }, (_, i) => i);
      } else if (interval === "yearly") {
        const y = parseInt(year) || new Date().getFullYear();
        const start = new Date(y, 0, 1);
        const end = new Date(y + 1, 0, 1);
        match = { createdAt: { $gte: start, $lt: end } };
        groupBy = { $month: "$createdAt" };
        labels = Array.from({ length: 12 }, (_, i) => i + 1);
      } else {
        const m = parseInt(month) || new Date().getMonth() + 1;
        const y = parseInt(year) || new Date().getFullYear();
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        match = { createdAt: { $gte: start, $lt: end } };
        groupBy = { $dayOfMonth: "$createdAt" };
        const daysInMonth = new Date(y, m, 0).getDate();
        labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      }
      const growthData = await User.aggregate([
        { $match: match },
        { $group: { _id: groupBy, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

      // If no user growth data exists, return default data
      if (growthData.length === 0) {
        const defaultData = labels.map((label) => ({
          interval: label,
          count: 0,
        }));
        res.json(defaultData);
        return;
      }

      const dataMap = Object.fromEntries(
        growthData.map((d) => [d._id, d.count])
      );
      const formattedData = labels.map((label) => ({
        interval: label,
        count: dataMap[label] || 0,
      }));
      res.json(formattedData);
    } catch (error) {
      console.error("Error fetching user growth data:", error);
      res
        .status(500)
        .json({ message: "Error fetching user growth data", error });
    }
  },

  // Company Management
  getAllCompanies: async (req, res) => {
    try {
      const { limit } = req.query;
      const CompanyProfile = (await import("../models/CompanyProfile.js"))
        .default;

      const pageSize = parseInt(limit, 10);

      // Aggregate without pagination
      let companiesAggregation = Company.aggregate([
        {
          $lookup: {
            from: "companyprofiles",
            localField: "_id",
            foreignField: "company",
            as: "companyProfile",
          },
        },
        {
          $unwind: {
            path: "$companyProfile",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            companyName: { $ifNull: ["$companyProfile.companyName", ""] },
          },
        },
        {
          $project: {
            email: 1,
            isActive: 1,
            companyName: 1,
            createdAt: 1,
            "companyProfile.industry": 1,
            "companyProfile.logo": 1,
            "companyProfile.location": 1,
            "companyProfile.companyAddress": 1,
          },
        },
      ]);

      if (pageSize > 0) {
        companiesAggregation = companiesAggregation.limit(pageSize);
      }

      const companies = await companiesAggregation.exec();

      const totalCompanies = await Company.countDocuments();

      res.json({
        companies,
        total: totalCompanies,
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching companies", error });
    }
  },
  updateCompany: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const company = await Company.findByIdAndUpdate(id, updates, {
        new: true,
      });
      res.json(company);
    } catch (error) {
      res.status(500).json({ message: "Error updating company", error });
    }
  },
  deleteCompany: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || req.user?._id;

      console.log(`🗑️ Admin ${adminId} attempting to delete company: ${id}`);

      // Validate company ID
      if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        console.error(`❌ Invalid company ID format: ${id}`);
        return res.status(400).json({ message: "Invalid company ID format" });
      }

      // Find the company first to check if it exists
      const company = await Company.findById(id);
      if (!company) {
        console.error(`❌ Company not found: ${id}`);
        return res.status(404).json({ message: "Company not found" });
      }

      console.log(`✅ Company found, proceeding with delete...`);

      // Delete the company (cascade middleware will handle related data)
      await Company.findOneAndDelete({ _id: id });

      console.log(`✅ Company deleted successfully: ${id}`);

      // Log admin action
      if (adminId) {
        await logAdminAction("Delete Company", adminId, { companyId: id });
      }

      // Send email notification
      if (company.email) {
        try {
          const { subject, html } = templates.accountDeleted({ name: company.name || company.email.split('@')[0], actor: 'Company' });
          await sendEmail(company.email, subject, undefined, html);
          console.log(`📧 Deletion email sent to: ${company.email}`);
        } catch (emailError) {
          console.error(`⚠️ Failed to send deletion email:`, emailError.message);
          // Don't fail the delete if email fails
        }
      }

      res.json({ message: "Company deleted successfully" });
    } catch (error) {
      console.error(`❌ Error deleting company:`, error);
      res.status(500).json({ 
        message: "Error deleting company", 
        error: error.message || "Unknown error occurred"
      });
    }
  },

  toggleCompanyActive: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || req.user?._id;

      const company = await Company.findById(id);
      if (!company)
        return res.status(404).json({ message: "Company not found" });

      const previousStatus = company.isActive;
      company.isActive = !company.isActive;
      await company.save();

      await logAdminAction(
        company.isActive ? "Activate Company" : "Deactivate Company",
        adminId,
        { companyId: id }
      );

      if (previousStatus !== company.isActive) {
        const { subject, html } = templates.accountStatus({ name: company.name || company.email.split('@')[0], isActive: company.isActive, actor: 'Company account' });
        sendEmail(company.email, subject, undefined, html).catch((emailError) => {
          console.error("Failed to send activation email:", emailError);
        });
      }

      res.json({
        message: `Company ${
          company.isActive ? "activated" : "deactivated"
        } successfully`,
        isActive: company.isActive,
      });
    } catch (error) {
      console.error("Error toggling company status:", error);
      res.status(500).json({ message: "Error toggling company status", error });
    }
  },

  // Job Management
  getAllJobs: async (req, res) => {
    try {
      // Get all jobs with company profile information using aggregation
      const jobs = await Job.aggregate([
        {
          $lookup: {
            from: "companies",
            localField: "companyId",
            foreignField: "_id",
            as: "company",
          },
        },
        {
          $lookup: {
            from: "companyprofiles",
            localField: "companyId",
            foreignField: "company",
            as: "companyProfile",
          },
        },
        {
          $lookup: {
            from: "industries",
            localField: "industry",
            foreignField: "_id",
            as: "industryInfo",
          },
        },
        {
          $unwind: {
            path: "$company",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$companyProfile",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $unwind: {
            path: "$industryInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      ]);

      // Transform the data adding effective unified status (Open/Closed)
      const transformedJobs = jobs.map((job) => {
        const companyProfile = job.companyProfile || {};
        const company = job.company || {};
        const effectiveStatus = getEffectiveStatus({ status: job.status, applicationDeadline: job.applicationDeadline });
        return {
          _id: job._id,
          title: job.jobTitle,
          description: job.description,
          type: job.jobType,
          location: job.location,
          salary: job.salary?.min || 0,
          salaryRange: job.salary,
            skills: job.skills,
          experienceLevel: job.experienceLevel,
          applicationDeadline: job.applicationDeadline,
          companyId: job.companyId,
          companyName: companyProfile.companyName || company.name || "Unknown Company",
          contactEmail: job.contactEmail,
          benefits: job.benefits,
          responsibilities: job.responsibilities,
          qualifications: job.qualifications,
          remoteOption: job.remoteOption,
          industry: job.industryInfo?.name || "Not specified",
          status: job.status, // stored status
          effectiveStatus,
          featured: job.featured,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        };
      });

      res.json(transformedJobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ message: "Error fetching jobs", error });
    }
  },
  updateJob: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const job = await Job.findByIdAndUpdate(id, updates, { new: true });
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: "Error updating job", error });
    }
  },
  approveJob: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || req.user?._id;

      console.log(`✅ Admin ${adminId} approving job: ${id}`);

      // Validate job ID
      if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        console.error(`❌ Invalid job ID format: ${id}`);
        return res.status(400).json({ message: "Invalid job ID format" });
      }

      const job = await Job.findByIdAndUpdate(id, { status: "Open" }, { new: true });

      if (!job) {
        console.error(`❌ Job not found: ${id}`);
        return res.status(404).json({ message: "Job not found" });
      }

      // Log admin action
      if (adminId) {
        await logAdminAction("Approve Job", adminId, { jobId: id });
      }

      // Send email to company
      try {
        const company = await Company.findById(job.companyId);
        if (company && company.email) {
          const CompanyProfile = (await import("../models/CompanyProfile.js")).default;
          const companyProfile = await CompanyProfile.findOne({ company: job.companyId });
          const companyName = companyProfile?.companyName || company.email.split('@')[0];
          
          const { subject, html } = templates.jobStatus({ 
            companyName, 
            jobTitle: job.jobTitle, 
            status: 'Approved (Active)' 
          });
          await sendEmail(company.email, subject, undefined, html);
          console.log(`📧 Job approval email sent to: ${company.email}`);
        }
      } catch (emailError) {
        console.error(`⚠️ Failed to send approval email:`, emailError.message);
      }

      // Notify frontends about job status change
      emitJobUpdate({ jobId: job._id, status: job.status, featured: job.featured });

      console.log(`✅ Job approved successfully: ${id}`);
      res.json({ message: "Job approved successfully", job });
    } catch (error) {
      console.error("❌ Error approving job:", error);
      res.status(500).json({ message: "Error approving job", error: error.message });
    }
  },

  rejectJob: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || req.user?._id;

      console.log(`🚫 Admin ${adminId} disabling job: ${id}`);

      // Validate job ID
      if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        console.error(`❌ Invalid job ID format: ${id}`);
        return res.status(400).json({ message: "Invalid job ID format" });
      }

      const job = await Job.findByIdAndUpdate(id, { status: "Closed" }, { new: true });

      if (!job) {
        console.error(`❌ Job not found: ${id}`);
        return res.status(404).json({ message: "Job not found" });
      }

      // Log admin action
      if (adminId) {
        await logAdminAction("Reject Job", adminId, { jobId: id });
      }

      // Send email to company
      try {
        const company = await Company.findById(job.companyId);
        if (company && company.email) {
          const CompanyProfile = (await import("../models/CompanyProfile.js")).default;
          const companyProfile = await CompanyProfile.findOne({ company: job.companyId });
          const companyName = companyProfile?.companyName || company.email.split('@')[0];
          
          const { subject, html } = templates.jobStatus({ 
            companyName, 
            jobTitle: job.jobTitle, 
            status: 'Disabled (Closed)' 
          });
          await sendEmail(company.email, subject, undefined, html);
          console.log(`📧 Job disable email sent to: ${company.email}`);
        }
      } catch (emailError) {
        console.error(`⚠️ Failed to send disable email:`, emailError.message);
      }

      // Notify frontends about job status change
      emitJobUpdate({ jobId: job._id, status: job.status, featured: job.featured });

      console.log(`✅ Job disabled successfully: ${id}`);
      res.json({ message: "Job disabled successfully", job });
    } catch (error) {
      console.error("❌ Error disabling job:", error);
      res.status(500).json({ message: "Error disabling job", error: error.message });
    }
  },

  featureJob: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || req.user?._id;

      const job = await Job.findByIdAndUpdate(id, { featured: true }, { new: true });

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      await logAdminAction("Feature Job", adminId, { jobId: id });

      // Notify frontends about feature change
      emitJobUpdate({ jobId: job._id, status: job.status, featured: job.featured });

      res.json({ message: "Job featured successfully", job });
    } catch (error) {
      console.error("Error featuring job:", error);
      res.status(500).json({ message: "Error featuring job", error });
    }
  },

  unfeatureJob: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || req.user?._id;

      const job = await Job.findByIdAndUpdate(id, { featured: false }, { new: true });

      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      await logAdminAction("Unfeature Job", adminId, { jobId: id });

      // Notify frontends about feature change
      emitJobUpdate({ jobId: job._id, status: job.status, featured: job.featured });

      res.json({ message: "Job unfeatured successfully", job });
    } catch (error) {
      console.error("Error unfeaturing job:", error);
      res.status(500).json({ message: "Error unfeaturing job", error });
    }
  },
  deleteJob: async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || req.user?._id;

      console.log(`🗑️ Admin ${adminId} deleting job: ${id}`);

      // Validate job ID
      if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
        console.error(`❌ Invalid job ID format: ${id}`);
        return res.status(400).json({ message: "Invalid job ID format" });
      }

      // Find job first to check existence and get details for email
      const job = await Job.findById(id);
      if (!job) {
        console.error(`❌ Job not found: ${id}`);
        return res.status(404).json({ message: "Job not found" });
      }

      // Send email to company BEFORE deleting
      try {
        const company = await Company.findById(job.companyId);
        if (company && company.email) {
          const CompanyProfile = (await import("../models/CompanyProfile.js")).default;
          const companyProfile = await CompanyProfile.findOne({ company: job.companyId });
          const companyName = companyProfile?.companyName || company.email.split('@')[0];
          
          const { subject, html } = templates.jobStatus({ 
            companyName, 
            jobTitle: job.jobTitle, 
            status: 'Deleted by Admin' 
          });
          await sendEmail(company.email, subject, undefined, html);
          console.log(`📧 Job deletion email sent to: ${company.email}`);
        }
      } catch (emailError) {
        console.error(`⚠️ Failed to send deletion email:`, emailError.message);
      }

      // Now delete the job (cascade will handle related data)
      await Job.findOneAndDelete({ _id: id });

      // Log admin action
      if (adminId) {
        await logAdminAction("Delete Job", adminId, { jobId: id });
      }

      // Notify frontends about deletion
      emitJobUpdate({ jobId: id, deleted: true });

      console.log(`✅ Job deleted successfully: ${id}`);
      res.json({ message: "Job deleted successfully" });
    } catch (error) {
      console.error("❌ Error deleting job:", error);
      res.status(500).json({ message: "Error deleting job", error: error.message });
    }
  },
  getJobStats: async (req, res) => {
    try {
      const jobStats = await Job.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      // If no jobs exist, return default stats
      if (jobStats.length === 0) {
        res.json([
          { _id: "Open", count: 0 },
          { _id: "Closed", count: 0 }
        ]);
        return;
      }

      res.json(jobStats);
    } catch (error) {
      console.error("Error fetching job stats:", error);
      res.status(500).json({ message: "Error fetching job stats", error });
    }
  },

  getJobTrends: async (req, res) => {
    try {
      const { interval = "monthly", date, month, year } = req.query;
      let match = {};
      let groupBy;
      let labels = [];
      if (interval === "hourly") {
        const selectedDate = date ? new Date(date) : new Date();
        const start = new Date(selectedDate.setHours(0, 0, 0, 0));
        const end = new Date(selectedDate.setHours(23, 59, 59, 999));
        match = { createdAt: { $gte: start, $lte: end } };
        groupBy = { $hour: "$createdAt" };
        labels = Array.from({ length: 24 }, (_, i) => i);
      } else if (interval === "yearly") {
        const y = parseInt(year) || new Date().getFullYear();
        const start = new Date(y, 0, 1);
        const end = new Date(y + 1, 0, 1);
        match = { createdAt: { $gte: start, $lt: end } };
        groupBy = { $month: "$createdAt" };
        labels = Array.from({ length: 12 }, (_, i) => i + 1);
      } else {
        const m = parseInt(month) || new Date().getMonth() + 1;
        const y = parseInt(year) || new Date().getFullYear();
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        match = { createdAt: { $gte: start, $lt: end } };
        groupBy = { $dayOfMonth: "$createdAt" };
        const daysInMonth = new Date(y, m, 0).getDate();
        labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      }
      const jobTrends = await Job.aggregate([
        { $match: match },
        { $group: { _id: groupBy, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

      // If no job trends data exists, return default data
      if (jobTrends.length === 0) {
        const defaultData = labels.map((label) => ({
          interval: label,
          count: 0,
        }));
        res.json(defaultData);
        return;
      }

      const dataMap = Object.fromEntries(
        jobTrends.map((d) => [d._id, d.count])
      );
      const formattedTrends = labels.map((label) => ({
        interval: label,
        count: dataMap[label] || 0,
      }));
      res.json(formattedTrends);
    } catch (error) {
      console.error("Error fetching job trends:", error);
      res.status(500).json({ message: "Error fetching job trends", error });
    }
  },
  // Get full company details including profile, jobs, interviews, hiring data
  getCompanyDetails: async (req, res) => {
    try {
      const { id } = req.params;

      const CompanyProfile = (await import("../models/CompanyProfile.js"))
        .default;
      const Job = (await import("../models/Job.js")).default;
      const Interview = (await import("../models/Interview.js")).default;

      // Fetch company profile
      const companyProfile = await CompanyProfile.findOne({
        company: id,
      }).lean();

      // Fetch posted jobs
      const jobs = await Job.find({ companyId: id }).lean();

      // Fetch interviews related to company jobs
      const jobIds = jobs.map((job) => job._id);
      const interviews = await Interview.find({
        jobId: { $in: jobIds },
      }).lean();

      // Hiring data: count of active jobs and interviews
      const activeJobsCount = jobs.filter(
        (job) => job.status === "active"
      ).length;
      const totalInterviews = interviews.length;

      res.json({
        companyProfile,
        jobs,
        interviews,
        hiringData: {
          activeJobsCount,
          totalInterviews,
        },
      });
    } catch (error) {
      console.error("Error fetching company details:", error);
      res
        .status(500)
        .json({ message: "Error fetching company details", error });
    }
  },
  bulkToggleUsersActive: async (req, res) => {
    try {
      const { ids, isActive } = req.body;
      const adminId = req.admin?.id || req.user?._id;

      if (!Array.isArray(ids) || typeof isActive !== "boolean") {
        return res.status(400).json({ message: "Invalid request body" });
      }

      const users = await User.find({ _id: { $in: ids } });

      await Promise.all(
        users.map(async (user) => {
          const previousStatus = user.isActive;
          user.isActive = isActive;
          await user.save();

          await logAdminAction(
            isActive ? "Activate User" : "Deactivate User",
            adminId,
            { userId: user._id }
          );

          if (previousStatus !== isActive) {
            const { subject, html } = templates.accountStatus({ 
              name: user.name || user.email.split('@')[0], 
              isActive: isActive, 
              actor: 'Account' 
            });
            sendEmail(user.email, subject, undefined, html).catch((emailError) => {
              console.error("Failed to send activation email:", emailError);
            });
          }
        })
      );

      res.json({
        message: `Users ${isActive ? "activated" : "deactivated"} successfully`,
        isActive,
      });
    } catch (error) {
      res.status(500).json({ message: "Error toggling users status", error });
    }
  },

  bulkToggleCompaniesActive: async (req, res) => {
    try {
      const { ids, isActive } = req.body;
      const adminId = req.admin?.id || req.user?._id;

      if (!Array.isArray(ids) || typeof isActive !== "boolean") {
        return res.status(400).json({ message: "Invalid request body" });
      }

      const companies = await Company.find({ _id: { $in: ids } });

      await Promise.all(
        companies.map(async (company) => {
          const previousStatus = company.isActive;
          company.isActive = isActive;
          await company.save();

          await logAdminAction(
            isActive ? "Activate Company" : "Deactivate Company",
            adminId,
            { companyId: company._id }
          );

          if (previousStatus !== isActive) {
            sendEmail(
              company.email,
              isActive
                ? "Company Account Activated"
                : "Company Account Deactivated",
              `Dear ${
                company.name || company.email.split("@")[0]
              }, your company account has been ${
                isActive ? "activated" : "deactivated"
              } by the admin.`,
              `<p>Dear ${
                company.name || company.email.split("@")[0]
              },</p><p>Your company account has been ${
                isActive ? "activated" : "deactivated"
              } by the admin.</p>`
            ).catch((emailError) => {
              console.error("Failed to send activation email:", emailError);
            });
          }
        })
      );

      res.json({
        message: `Companies ${
          isActive ? "activated" : "deactivated"
        } successfully`,
        isActive,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error toggling companies status", error });
    }
  },
};

export default adminController;
