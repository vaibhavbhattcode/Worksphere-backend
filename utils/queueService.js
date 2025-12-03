// Simple in-process queue replacement for Bull (no Redis required)
// Provides a minimal `add(jobName, data, opts)` API used by the codebase.
import { sendEmail } from './emailService.js';
import Notification from '../models/Notification.js';

// Note: we intentionally process jobs inline asynchronously using setImmediate
// so the API behaves like a non-blocking queue while remaining dependency-free.

const emailQueue = {
  add: async (jobName, jobData, opts = {}) => {
    return new Promise((resolve, reject) => {
      setImmediate(async () => {
        try {
          if (String(jobName) === 'sendEmail') {
            await sendEmail(jobData.to, jobData.subject, jobData.template, jobData.data);
            console.log('[queue][inline] sendEmail processed');
            return resolve(true);
          }
          console.warn('[queue][inline] Unknown email job:', jobName);
          return resolve(false);
        } catch (err) {
          console.error('[queue][inline] sendEmail error:', err?.message || err);
          return reject(err);
        }
      });
    });
  }
};

const notificationQueue = {
  add: async (jobName, jobData, opts = {}) => {
    return new Promise((resolve, reject) => {
      setImmediate(async () => {
        try {
          if (String(jobName) === 'sendNotifications') {
            const { notifications } = jobData || {};
            if (!Array.isArray(notifications) || notifications.length === 0) {
              console.warn('[queue][inline] sendNotifications called with no notifications');
              return resolve([]);
            }
            const inserted = await Notification.insertMany(notifications);
            // Emit via socket module if available (lazy import to avoid cycles)
            try {
              const { emitNotification } = await import('../socket.js');
              inserted.forEach(notif => emitNotification(notif.userId || notif.user, notif));
            } catch (emitErr) {
              console.warn('[queue][inline] emitNotification failed:', emitErr?.message || emitErr);
            }
            console.log('[queue][inline] sendNotifications processed, inserted:', inserted.length);
            return resolve(inserted);
          }
          console.warn('[queue][inline] Unknown notification job:', jobName);
          return resolve(false);
        } catch (err) {
          console.error('[queue][inline] sendNotifications error:', err?.message || err);
          return reject(err);
        }
      });
    });
  }
};

export { emailQueue, notificationQueue };
