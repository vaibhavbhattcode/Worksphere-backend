import Job from "../models/Job.js";
import Applicant from "../models/Application.js";
import CompanyProfile from "../models/CompanyProfile.js";
import Interview from "../models/Interview.js";
import mongoose from "mongoose";

export const getDashboardOverview = async (req, res) => {
  try {
    // Extract date filtering parameters
    const { startDate, endDate } = req.query;
    let dateFilter = {};
    
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999); // End of day
        dateFilter.createdAt.$lte = endDateTime;
      }
    }

    // Fetch the company profile for the logged-in company
    const companyProfile = await CompanyProfile.findOne({
      company: req.user._id,
    })
      .select("company companyName logo")
      .lean();

    const userSnapshot =
      typeof req.user?.toObject === "function" ? req.user.toObject() : { ...req.user };

    // Merge the profile data with the user data from req.user
    const companyData = {
      ...userSnapshot,
      ...(companyProfile || {}),
    };

    // Ensure a valid companyName exists; if not, fallback to the email prefix
    if (!companyData.companyName || !companyData.companyName.trim()) {
      companyData.companyName = req.user.email
        ? req.user.email.split("@")[0]
        : "Your Company Name";
    }

    // Build job filter
    const jobFilter = { companyId: req.user._id };
    const jobWithDateFilter = {
      companyId: req.user._id,
      ...(Object.keys(dateFilter).length > 0 ? dateFilter : {}),
    };

    // Get job stats and job IDs in parallel - optimized
    const [totalJobPostings, activeJobs, closedJobs, jobs] = await Promise.all([
      Job.countDocuments(jobWithDateFilter),
      Job.countDocuments({ ...jobWithDateFilter, status: "Open" }),
      Job.countDocuments({ ...jobWithDateFilter, status: "Closed" }),
      Job.find(jobFilter).select("_id").lean(),
    ]);

    const jobIds = jobs.map((job) => job._id);

    // Build application filter with date range
    const applicationFilter = {
      jobId: { $in: jobIds },
      ...(Object.keys(dateFilter).length > 0 ? dateFilter : {}),
    };

    // Aggregate application stats by status with date filtering - all in parallel
    const [
      totalApplications,
      pendingApplications,
      acceptedApplications,
      rejectedApplications,
      viewedApplications,
      interviewsScheduled,
      completedInterviews,
    ] = await Promise.all([
      Applicant.countDocuments(applicationFilter),
      Applicant.countDocuments({ ...applicationFilter, status: "pending" }),
      Applicant.countDocuments({ ...applicationFilter, status: "hired" }),
      Applicant.countDocuments({ ...applicationFilter, status: "rejected" }),
      Applicant.countDocuments({ ...applicationFilter, status: "shortlisted" }),
      Interview.countDocuments({
        jobId: { $in: jobIds },
        date: { $gte: new Date() },
        status: { $in: ["scheduled", "rescheduled"] },
        ...(Object.keys(dateFilter).length > 0 ? dateFilter : {}),
      }),
      Interview.countDocuments({
        jobId: { $in: jobIds },
        status: "completed",
        ...(Object.keys(dateFilter).length > 0 ? dateFilter : {}),
      }),
    ]);

    // Get upcoming interviews (limit to 10) - always show future interviews
    const upcomingInterviewsData = await Interview.find({
      jobId: { $in: jobIds },
      date: { $gte: new Date() },
      status: { $in: ["scheduled", "rescheduled"] },
    })
      .select("date jobId userId")
      .limit(10)
      .populate("jobId", "jobTitle")
      .populate("userId", "email")
      .sort({ date: 1 })
      .lean();

    console.log(`Found ${upcomingInterviewsData.length} upcoming interviews`);

    // Fetch UserProfile names for interviews
    const interviewUserIds = upcomingInterviewsData.map(i => i.userId?._id).filter(Boolean);
    const UserProfile = mongoose.model('UserProfile');
    const interviewProfiles = await UserProfile.find({ user: { $in: interviewUserIds } })
      .select('user name')
      .lean();
    
    const profileNameMap = new Map();
    interviewProfiles.forEach(profile => {
      profileNameMap.set(profile.user.toString(), profile.name);
    });

    const upcomingInterviews = upcomingInterviewsData.map((interview) => {
      const candidateName = interview.userId?._id 
        ? profileNameMap.get(interview.userId._id.toString()) 
        : null;
      
      return {
        id: interview._id,
        candidateName: candidateName || "Candidate",
        candidateEmail: interview.userId?.email || "N/A",
        position: interview.jobId?.jobTitle || "Position",
        date: interview.date
          ? new Date(interview.date).toLocaleString()
          : "N/A",
      };
    });

    console.log("Upcoming interviews with names:", upcomingInterviews);

    // Dynamic application trends based on interval query parameter
    const interval = req.query.interval || "months";
    let trendStartDate, groupBy;

    // For trends, use date filter if provided, otherwise use interval defaults
    if (startDate && endDate) {
      trendStartDate = new Date(startDate);
    } else if (interval === "years") {
      trendStartDate = new Date();
      trendStartDate.setFullYear(trendStartDate.getFullYear() - 5);
    } else if (interval === "hours") {
      trendStartDate = new Date();
      trendStartDate.setHours(trendStartDate.getHours() - 24);
    } else {
      trendStartDate = new Date();
      trendStartDate.setMonth(trendStartDate.getMonth() - 6);
    }

    if (interval === "years") {
      groupBy = { year: { $year: "$createdAt" } };
    } else if (interval === "hours") {
      groupBy = {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
        day: { $dayOfMonth: "$createdAt" },
        hour: { $hour: "$createdAt" },
      };
    } else {
      groupBy = {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      };
    }

    // Build trend filter
    const trendFilter = {
      jobId: { $in: jobIds },
      createdAt: { $gte: trendStartDate },
    };
    
    // Apply end date if provided
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      trendFilter.createdAt.$lte = endDateTime;
    }

    const applicationTrends = await Applicant.aggregate([
      { $match: trendFilter },
      {
        $group: {
          _id: groupBy,
          applications: { $sum: 1 },
        },
      },
      {
        $sort:
          interval === "hours"
            ? { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1 }
            : { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    // Format application trends
    const formattedTrends = [];
    const today = new Date();

    if (interval === "years") {
      for (let i = 4; i >= 0; i--) {
        const year = today.getFullYear() - i;
        const trend = applicationTrends.find((t) => t._id.year === year);
        formattedTrends.push({
          name: year.toString(),
          applications: trend ? trend.applications : 0,
        });
      }
    } else if (interval === "hours") {
      for (let i = 23; i >= 0; i--) {
        const date = new Date(today.getTime() - i * 60 * 60 * 1000);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hour = date.getHours();
        const trend = applicationTrends.find(
          (t) =>
            t._id.year === year &&
            t._id.month === month &&
            t._id.day === day &&
            t._id.hour === hour
        );
        formattedTrends.push({
          name: `${hour}:00`,
          applications: trend ? trend.applications : 0,
        });
      }
    } else {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const trend = applicationTrends.find(
          (t) => t._id.year === year && t._id.month === month
        );
        formattedTrends.push({
          name: monthNames[month - 1],
          applications: trend ? trend.applications : 0,
        });
      }
    }

    // Build the dashboard data object with enhanced metrics
    const dashboardData = {
      company: {
        ...companyData,
        email: req.user.email,
      },
      metrics: {
        totalJobPostings,
        activeJobs,
        closedJobs,
        totalApplications,
        pendingApplications,
        acceptedApplications,
        rejectedApplications,
        viewedApplications,
        interviewsScheduled,
        completedInterviews,
        upcomingInterviews,
        applicationTrends: formattedTrends,
      },
      incompleteProfile:
        !companyProfile ||
        !companyProfile.companyName ||
        !companyProfile.companyName.trim(),
      incompleteProfileMessage:
        !companyProfile ||
        !companyProfile.companyName ||
        !companyProfile.companyName.trim()
          ? "Your profile is incomplete. Please complete your profile for a better experience."
          : "",
    };

    return res.json(dashboardData);
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
