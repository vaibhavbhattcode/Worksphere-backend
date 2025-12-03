import Interview from "../models/Interview.js";
import Application from "../models/Application.js";
import User from "../models/User.js";
import Job from "../models/Job.js";
import sendEmail from "../utils/sendEmail.js";
import templates from "../utils/emailTemplates.js";
import { createNotification } from "./notificationController.js";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import { formatDate, formatTime } from "../utils/dateUtils.js";
import { sendError } from "../utils/errorResponse.js";
import Notification from "../models/Notification.js";
import { emitNotification } from "../socket.js";

const getJitsiMeetLink = (roomId) => `https://meet.jit.si/${roomId}`;

export const scheduleInterview = async (req, res) => {
  try {
    console.log("=== INTERVIEW SCHEDULE REQUEST ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    console.log("Company ID:", req.user?._id);
    
    const { jobId, userId, applicationId, date, notes } = req.body;

    // 1) Validate inputs with detailed messages
    if (!jobId) {
      console.error("Validation failed: Job ID is missing");
      return res.status(400).json({ message: "Job ID is required" });
    }
    if (!userId) {
      console.error("Validation failed: User ID is missing");
      return res.status(400).json({ message: "User ID is required" });
    }
    if (!applicationId) {
      console.error("Validation failed: Application ID is missing");
      return res.status(400).json({ message: "Application ID is required" });
    }
    if (!date) {
      console.error("Validation failed: Interview date is missing");
      return res.status(400).json({ message: "Interview date is required" });
    }
    console.log("All required fields present");

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      console.error("Validation failed: Invalid Job ID format:", jobId);
      return res.status(400).json({ message: "Invalid Job ID format" });
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error("Validation failed: Invalid User ID format:", userId);
      return res.status(400).json({ message: "Invalid User ID format" });
    }
    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      console.error("Validation failed: Invalid Application ID format:", applicationId);
      return res.status(400).json({ message: "Invalid Application ID format" });
    }
    console.log("All ObjectIds are valid");

    // Validate date is not in the past
    const interviewDate = new Date(date);
    const now = new Date();
    if (interviewDate < now) {
      console.error("Validation failed: Interview date is in the past:", interviewDate);
      return res.status(400).json({ message: "Interview date cannot be in the past. Please select a future date and time." });
    }
    console.log("Interview date is valid (future date)");

    // 2) Verify the application belongs to this company and populate companyProfile
    const application = await Application.findById(applicationId)
      .populate({
        path: "jobId",
        select: "jobTitle companyId",
        populate: { path: "companyProfile", select: "companyName" }, // Populate the virtual companyProfile
      })
      .populate("userId", "email");
    
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }
    if (!application.jobId) {
      return res.status(404).json({ message: "Job not found for this application" });
    }
    if (application.jobId.companyId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized: This application does not belong to your company" });
    }
    console.log("Application found:", {
      applicationId: application._id,
      jobId: application.jobId._id,
      userId: application.userId._id,
      companyId: application.jobId.companyId,
      reqUserId: req.user._id,
      companyName: application.jobId.companyProfile?.companyName || "N/A",
    });

    // 3) Fetch candidate and UserProfile for name
    const appUserId = application.userId._id.toString();
    let user = await User.findById(userId);
    
    if (!user || user._id.toString() !== appUserId) {
      user = application.userId;
      console.log("User ID mismatch: Using application userId", appUserId);
    }
    if (!user) {
      return res.status(404).json({ message: "Candidate not found" });
    }

    // Fetch UserProfile to get candidate name
    const userProfile = await mongoose.model('UserProfile').findOne({ user: user._id }).select('name').lean();
    const candidateName = userProfile?.name || "Candidate";
    
    console.log("User found:", {
      userId: user._id,
      name: candidateName,
      email: user.email,
    });

    // 4) Check for existing interview with application userId
    let isReschedule = false;
    const existingInterview = await Interview.findOne({
      jobId,
      userId: appUserId,
    }).lean();
    console.log("Existing interview check:", {
      existingInterview: existingInterview
        ? {
            id: existingInterview._id,
            jobId: existingInterview.jobId,
            userId: existingInterview.userId,
            applicationId: existingInterview.applicationId,
          }
        : null,
      query: { jobId, userId: appUserId },
      isMatch: existingInterview !== null,
    });
    if (existingInterview) {
      isReschedule = true;
      const deletionResult = await Interview.deleteOne({
        _id: existingInterview._id,
      });
      if (deletionResult.deletedCount === 1) {
        console.log(
          "Successfully deleted existing interview:",
          existingInterview
        );
      } else {
        console.log(
          "No interview deleted, possibly already removed:",
          existingInterview
        );
      }
    } else {
      // Fallback: Check count with application userId
      const priorInterviewCount = await Interview.countDocuments({
        jobId,
        userId: appUserId,
      });
      if (priorInterviewCount > 0) {
        console.log(
          "Fallback detected prior interview count:",
          priorInterviewCount
        );
        isReschedule = true;
      }
    }

    // 5) Create new interview record
    const jitsiRoomId = `WorkSphere_Interview_${jobId}_${applicationId}_${uuidv4()}`;
    const interview = new Interview({
      jobId,
      userId: user._id,
      applicationId,
      date: new Date(date),
      jitsiRoomId,
      notes,
    });
    await interview.save();
    console.log("Created new interview:", {
      id: interview._id,
      jobId: interview.jobId,
      userId: interview.userId,
      applicationId: interview.applicationId,
      date: interview.date,
    });

    // 6) Send notification email with professional layout
    console.log("Email preparation:", { isReschedule, email: user.email });
    const emailSubject = isReschedule
      ? "Interview Rescheduled - WorkSphere"
      : "Interview Scheduled - WorkSphere";
    const emailGreeting = isReschedule
      ? `Dear ${candidateName},<br/><br/>We have rescheduled your interview for the position of <strong>${
          application.jobId.jobTitle || "N/A"
        }</strong> at <strong>${
          application.jobId.companyProfile?.companyName || "N/A"
        }</strong>. Please find the updated details below.`
      : `Dear ${candidateName},<br/><br/>We are pleased to schedule an interview for the position of <strong>${
          application.jobId.jobTitle || "N/A"
        }</strong> at <strong>${
          application.jobId.companyProfile?.companyName || "N/A"
        }</strong>. Please find the details below.`;
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="font-size: 24px; font-weight: bold; color: #1a73e8;">WorkSphere</h1>
        </div>
        <h2 style="color: #1a73e8; font-size: 24px; margin-bottom: 20px;">
          ${isReschedule ? "Interview Rescheduled" : "Interview Scheduled"}
        </h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          ${emailGreeting}
        </p>
        <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #e0e0e0;">
          <h3 style="color: #333; font-size: 18px; margin-bottom: 10px;">Interview Details</h3>
          <ul style="list-style: none; padding: 0; color: #555; font-size: 14px;">
            <li style="margin-bottom: 10px;"><strong>Position:</strong> ${
              application.jobId.jobTitle || "N/A"
            }</li>
            <li style="margin-bottom: 10px;"><strong>Company:</strong> ${
              application.jobId.companyProfile?.companyName || "N/A"
            }</li>
            <li style="margin-bottom: 10px;"><strong>Date & Time:</strong> ${formatDate(
              date
            )} at ${formatTime(date)}</li>
            <li style="margin-bottom: 10px;"><strong>Location:</strong> Virtual (via Jitsi Meet)</li>
            <li style="margin-bottom: 10px;"><strong>Join Link:</strong> <a href="${getJitsiMeetLink(
              interview.jitsiRoomId
            )}" style="color: #1a73e8; text-decoration: none;">Join Interview</a></li>
            <li style="margin-bottom: 10px;"><strong>Notes:</strong> ${
              notes || "None"
            }</li>
          </ul>
        </div>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Please join the interview at the ${
            isReschedule ? "updated" : "scheduled"
          } time using the link above. No account is required—just open it in your browser. ${
      isReschedule ? "Note: The old interview link will not work." : ""
    } For any questions, contact us at <a href="mailto:support@worksphere.com" style="color: #1a73e8; text-decoration: none;">support@worksphere.com</a>.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6; margin-top: 20px;">
          Best regards,<br/>
          The WorkSphere Team
        </p>
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #777; font-size: 12px;">
          © 2025 WorkSphere | <a href="https://worksphere.com" style="color: #1a73e8; text-decoration: none;">Website</a> | <a href="https://worksphere.com/privacy" style="color: #1a73e8; text-decoration: none;">Privacy Policy</a>
        </div>
      </div>
    `;

    const { subject, html } = templates.interviewScheduled({
      name: candidateName,
      companyName: application.jobId.companyProfile?.companyName || "Company",
      jobTitle: application.jobId.jobTitle || "Position",
      dateStr: formatDate(date),
      timeStr: formatTime(date),
      joinUrl: getJitsiMeetLink(interview.jitsiRoomId),
      notes,
      isReschedule,
    });
    try {
      await sendEmail(user.email, subject, undefined, html);
      console.log("Interview email sent to:", user.email, "subject:", subject);
    } catch (emailErr) {
      console.error("[email] Failed to send interview email:", emailErr && emailErr.message ? emailErr.message : emailErr);
      // Continue — email failure should not break interview creation. Notifications will still be created.
    }

    // 7) Create notification for user
    const companyName =
      application.jobId.companyProfile?.companyName || "the company";
    const jobTitle = application.jobId.jobTitle || "the job";
    
    await createNotification({
      userId: user._id,
      companyId: application.jobId.companyId,
      // Use a rescheduled-specific type when updating an existing interview
      type: isReschedule ? "interview_rescheduled" : "interview_scheduled",
      title: isReschedule ? "Interview Rescheduled" : "Interview Scheduled",
      message: isReschedule
        ? `Your interview for ${jobTitle} at ${companyName} has been rescheduled to ${formatDate(date)} at ${formatTime(date)}.`
        : `Your interview for ${jobTitle} at ${companyName} is scheduled for ${formatDate(date)} at ${formatTime(date)}.`,
      data: {
        jobId,
        applicationId,
        interviewId: interview._id,
        actionUrl: `/interviews/${interview._id}`
      },
      priority: "urgent"
    });
    // Notify company as well
    await createNotification({
      companyId: application.jobId.companyId,
      // Company gets a rescheduled notification type when an interview is rescheduled
      type: isReschedule ? "interview_rescheduled" : "interview_scheduled",
      title: isReschedule ? "Interview Rescheduled" : "Interview Scheduled",
      message: isReschedule
        ? `Interview for ${jobTitle} with ${candidateName} has been rescheduled to ${formatDate(date)} at ${formatTime(date)}.`
        : `Interview for ${jobTitle} with ${candidateName} is scheduled for ${formatDate(date)} at ${formatTime(date)}.`,
      data: {
        jobId,
        applicationId,
        interviewId: interview._id,
        userId: user._id,
        actionUrl: `/company/applications`
      },
      priority: "high"
    });

    return res.status(201).json({
      message: isReschedule
        ? "Interview rescheduled successfully"
        : "Interview scheduled successfully",
      interview,
      isReschedule,
    });
  } catch (err) {
    console.error("Error in scheduleInterview:", err);
    return sendError(res, 500, "Server error", { error: err.message });
  }
};

export const getInterviewsByJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return sendError(res, 400, "Invalid jobId format");
    }

    // Verify job belongs to this company, only fetch _id and companyId
    const job = await Job.findById(jobId).select("_id jobTitle companyId");
    if (!job || job.companyId.toString() !== req.user._id.toString()) {
      return sendError(res, 403, "Unauthorized or invalid job");
    }
    console.log(`Job found for getInterviewsByJob: ${jobId}, title: ${job.jobTitle}`);

    // Only select required fields for performance
    const interviews = await Interview.find({ jobId })
      .select("_id jobId userId applicationId date notes status")
      .populate("userId", "_id name email")
      .lean();
    // Optionally, map to only send minimal data
    const minimalInterviews = interviews.map(iv => ({
      _id: iv._id,
      jobId: iv.jobId,
      userId: iv.userId, // {_id, name, email}
      applicationId: iv.applicationId,
      date: iv.date,
      notes: iv.notes,
      status: iv.status
    }));
    console.log(`Returning ${minimalInterviews.length} interviews for job ${jobId}`);
    return res.status(200).json(minimalInterviews);
  } catch (err) {
    console.error("Error in getInterviewsByJob:", err);
    return sendError(res, 500, "Server error", { error: err.message });
  }
};

export const cancelInterview = async (req, res) => {
  try {
    const { interviewId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(interviewId)) {
      return res.status(400).json({ message: "Invalid interviewId format" });
    }
    const interview = await Interview.findById(interviewId)
      .populate("userId")
      .populate({ path: "jobId", populate: { path: "companyProfile" } });
    if (!interview) {
      return res.status(404).json({ message: "Interview not found" });
    }
    // Only allow company to cancel their own interview
    if (interview.jobId.companyId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    interview.status = "cancelled";
    await interview.save();
    
    // Send cancellation email - get name from UserProfile
    const user = interview.userId;
    const job = interview.jobId;
    
    const userProfile = await mongoose.model('UserProfile').findOne({ user: user._id }).select('name').lean();
    const candidateName = userProfile?.name || "Candidate";
    
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="font-size: 24px; font-weight: bold; color: #1a73e8;">WorkSphere</h1>
        </div>
        <h2 style="color: #e53935; font-size: 24px; margin-bottom: 20px;">Interview Cancelled</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Dear ${candidateName},<br/><br/>
          We regret to inform you that your interview for the position of <strong>${
            job.jobTitle || "N/A"
          }</strong> at <strong>${
      job.companyProfile?.companyName || "N/A"
    }</strong> has been cancelled.<br/><br/>
          If you have any questions, please contact us at <a href="mailto:support@worksphere.com" style="color: #1a73e8; text-decoration: none;">support@worksphere.com</a>.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6; margin-top: 20px;">
          Best regards,<br/>
          The WorkSphere Team
        </p>
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #777; font-size: 12px;">
          © 2025 WorkSphere | <a href="https://worksphere.com" style="color: #1a73e8; text-decoration: none;">Website</a> | <a href="https://worksphere.com/privacy" style="color: #1a73e8; text-decoration: none;">Privacy Policy</a>
        </div>
      </div>
    `;
    const { subject, html } = templates.interviewCancelled({
      name: candidateName,
      companyName: job.companyProfile?.companyName || "Company",
      jobTitle: job.jobTitle || "Position",
    });
    try {
      await sendEmail(user.email, subject, undefined, html);
    } catch (emailErr) {
      console.error("[email] Failed to send interview cancellation email:", emailErr && emailErr.message ? emailErr.message : emailErr);
      // Continue — still create notifications and return success
    }
    
    // Create notification for user about cancellation
    await createNotification({
      userId: user._id,
      type: "interview_cancelled",
      title: "Interview Cancelled",
      message: `Your interview for ${job.jobTitle || "the job"} at ${
        job.companyProfile?.companyName || "the company"
      } has been cancelled.`,
      data: {
        jobId: job._id,
        interviewId: interview._id,
      },
      priority: "high"
    });
    // Notify company as well
    await createNotification({
      companyId: job.companyId,
      type: "interview_cancelled",
      title: "Interview Cancelled",
      message: `Interview for ${job.jobTitle || "the job"} with ${candidateName} has been cancelled.`,
      data: {
        jobId: job._id,
        interviewId: interview._id,
        userId: user._id,
        actionUrl: `/company/applications`
      },
      priority: "high"
    });
    
    console.log("Interview cancelled successfully:", interviewId);
    
    return res
      .status(200)
      .json({ message: "Interview cancelled and candidate notified." });
  } catch (err) {
    console.error("Error in cancelInterview:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};
