// utils/jobScheduler.js
// Scheduled tasks for automatic job management

import cron from 'node-cron';
import Job from '../models/Job.js';
import Interview from '../models/Interview.js';
import { createNotification } from '../controllers/notificationController.js';

/**
 * Auto-close jobs that have passed their application deadline
 * Runs daily at 1:00 AM
 */
export const autoCloseExpiredJobs = () => {
  // Run every day at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    try {
      console.log('🔄 Running scheduled task: Auto-close expired jobs');
      
      const now = new Date();
      
      // Find all Open jobs with expired deadlines
      const expiredJobs = await Job.find({
        status: 'Open',
        applicationDeadline: { $lt: now }
      });
      
      if (expiredJobs.length === 0) {
        console.log('✅ No expired jobs found');
        return;
      }
      
      // Close all expired jobs
      const result = await Job.updateMany(
        {
          status: 'Open',
          applicationDeadline: { $lt: now }
        },
        {
          $set: { status: 'Closed' }
        }
      );
      
      console.log(`✅ Auto-closed ${result.modifiedCount} expired jobs`);
      
      // Log each job for audit trail
      expiredJobs.forEach(job => {
        console.log(`  - Job ${job._id}: "${job.jobTitle}" (deadline: ${job.applicationDeadline})`);
      });
      
    } catch (error) {
      console.error('❌ Error in auto-close expired jobs task:', error);
    }
  });
  
  console.log('⏰ Job scheduler initialized: Auto-close expired jobs (daily at 1:00 AM)');
};

/**
 * Send reminder notifications for jobs expiring soon
 * Runs daily at 9:00 AM
 */
export const sendExpiringJobReminders = () => {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('🔄 Running scheduled task: Send expiring job reminders');
      
      const now = new Date();
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(now.getDate() + 3);
      
      // Find jobs expiring in the next 3 days
      const expiringJobs = await Job.find({
        status: 'Open',
        applicationDeadline: {
          $gte: now,
          $lte: threeDaysFromNow
        }
      }).populate('companyId', 'email');
      
      if (expiringJobs.length === 0) {
        console.log('✅ No jobs expiring in the next 3 days');
        return;
      }
      
      console.log(`📧 Found ${expiringJobs.length} jobs expiring soon`);
      
      // You can integrate with your email queue here
      // Example: emailQueue.add('expiringJobReminder', { jobs: expiringJobs });
      
      expiringJobs.forEach(job => {
        const daysLeft = Math.ceil((new Date(job.applicationDeadline) - now) / (1000 * 60 * 60 * 24));
        console.log(`  - Job ${job._id}: "${job.jobTitle}" expires in ${daysLeft} days`);
      });
      
    } catch (error) {
      console.error('❌ Error in expiring job reminders task:', error);
    }
  });
  
  console.log('⏰ Job scheduler initialized: Expiring job reminders (daily at 9:00 AM)');
};

/**
 * Clean up old closed jobs (optional - runs monthly)
 * Archives jobs closed for more than 6 months
 */
export const archiveOldJobs = () => {
  // Run on the 1st of every month at 2:00 AM
  cron.schedule('0 2 1 * *', async () => {
    try {
      console.log('🔄 Running scheduled task: Archive old closed jobs');
      
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      
      // Find old closed jobs
      const oldJobs = await Job.find({
        status: 'Closed',
        updatedAt: { $lt: sixMonthsAgo }
      });
      
      if (oldJobs.length === 0) {
        console.log('✅ No old jobs to archive');
        return;
      }
      
      console.log(`📦 Found ${oldJobs.length} old closed jobs (>6 months)`);
      
      // You can move these to an archive collection or just log them
      // For now, we just log. Implement archiving based on your needs.
      oldJobs.forEach(job => {
        console.log(`  - Job ${job._id}: "${job.jobTitle}" (closed: ${job.updatedAt})`);
      });
      
      // Optional: Move to archive collection
      // await ArchivedJob.insertMany(oldJobs);
      // await Job.deleteMany({ _id: { $in: oldJobs.map(j => j._id) } });
      
    } catch (error) {
      console.error('❌ Error in archive old jobs task:', error);
    }
  });
  
  console.log('⏰ Job scheduler initialized: Archive old jobs (monthly on 1st at 2:00 AM)');
};

/**
 * Initialize all job schedulers
 */
export const initializeJobSchedulers = () => {
  console.log('\n🚀 Initializing job schedulers...\n');
  autoCloseExpiredJobs();
  sendExpiringJobReminders();
  archiveOldJobs();
  sendInterviewReminders();
  console.log('\n✅ All job schedulers initialized successfully\n');
};

/**
 * Send interview reminder notifications
 * Runs every hour to check for upcoming interviews
 */
export const sendInterviewReminders = () => {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('🔄 Running scheduled task: Send interview reminders');
      
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      // Find interviews scheduled in the next 24 hours that haven't been reminded
      const upcomingInterviews = await Interview.find({
        date: {
          $gte: now,
          $lte: in24Hours
        },
        reminderSent: { $ne: true }
      })
      .populate('userId', 'name email')
      .populate({
        path: 'jobId',
        select: 'jobTitle companyId',
        populate: {
          path: 'companyProfile',
          select: 'companyName'
        }
      });
      
      if (upcomingInterviews.length === 0) {
        console.log('✅ No interviews requiring reminders');
        return;
      }
      
      console.log(`📧 Sending reminders for ${upcomingInterviews.length} upcoming interviews`);
      
      for (const interview of upcomingInterviews) {
        try {
          const hoursUntil = Math.round((new Date(interview.date) - now) / (1000 * 60 * 60));
          const jobTitle = interview.jobId?.jobTitle || "your interview";
          const companyName = interview.jobId?.companyProfile?.companyName || "the company";
          
          await createNotification({
            userId: interview.userId._id,
            type: "interview_reminder",
            title: "Interview Reminder",
            message: `Your interview for ${jobTitle} at ${companyName} is in ${hoursUntil} hours.`,
            data: {
              jobId: interview.jobId?._id,
              interviewId: interview._id,
              actionUrl: `/interviews/${interview._id}`
            },
            priority: "urgent"
          });
          
          // Mark reminder as sent
          await Interview.updateOne(
            { _id: interview._id },
            { $set: { reminderSent: true } }
          );
          
          console.log(`  ✅ Reminder sent for interview ${interview._id} (${hoursUntil}h)`);
        } catch (err) {
          console.error(`  ❌ Failed to send reminder for interview ${interview._id}:`, err);
        }
      }
      
    } catch (error) {
      console.error('❌ Error in interview reminders task:', error);
    }
  });
  
  console.log('⏰ Job scheduler initialized: Interview reminders (hourly)');
};

export default {
  autoCloseExpiredJobs,
  sendExpiringJobReminders,
  archiveOldJobs,
  sendInterviewReminders,
  initializeJobSchedulers
};
