/**
 * Model Helper Functions
 * Reusable functions for common database operations
 */

import UserProfile from "../models/UserProfile.js";
import CompanyProfile from "../models/CompanyProfile.js";
import Experience from "../models/Experience.js";
import Education from "../models/Education.js";
import Certificate from "../models/Certificate.js";
import Application from "../models/Application.js";
import SavedJob from "../models/SavedJob.js";
import Search from "../models/Search.js";
import Job from "../models/Job.js";
import Notification from "../models/Notification.js";

/**
 * Fetch user profile by user ID
 * @param {ObjectId} userId - User ID
 * @param {String} select - Fields to select (optional)
 * @param {Boolean} lean - Use lean query (default: true)
 * @returns {Promise<Object>} User profile
 */
export const getUserProfile = async (userId, select = '', lean = true) => {
  let query = UserProfile.findOne({ user: userId });
  
  if (select) query = query.select(select);
  if (lean) query = query.lean();
  
  return query;
};

/**
 * Fetch user profile with full data (profile, experience, education, certificates)
 * @param {ObjectId} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Complete user data
 */
export const getUserCompleteProfile = async (userId, options = {}) => {
  const {
    includeSkills = true,
    includeExperience = true,
    includeEducation = true,
    includeCertificates = true,
  } = options;

  const queries = [
    getUserProfile(
      userId,
      includeSkills
        ? 'user name title location phone about skills socialLinks profileImage resume resumeName videoIntroduction resumePreferences'
        : 'user name title location phone about socialLinks profileImage resume resumeName videoIntroduction resumePreferences'
    ),
  ];

  if (includeExperience) {
    queries.push(Experience.find({ user: userId }).select('-__v').lean());
  }
  if (includeEducation) {
    queries.push(Education.find({ user: userId }).select('-__v').lean());
  }
  if (includeCertificates) {
    queries.push(Certificate.find({ user: userId }).select('-__v').lean());
  }

  const results = await Promise.all(queries);

  const profile = results[0];
  let index = 1;

  return {
    profile,
    experience: includeExperience ? results[index++] : [],
    education: includeEducation ? results[index++] : [],
    certificates: includeCertificates ? results[index++] : [],
  };
};

/**
 * Fetch company profile by company ID
 * @param {ObjectId} companyId - Company ID
 * @param {String} select - Fields to select (optional)
 * @param {Boolean} lean - Use lean query (default: true)
 * @returns {Promise<Object>} Company profile
 */
export const getCompanyProfile = async (companyId, select = '', lean = true) => {
  let query = CompanyProfile.findOne({ company: companyId });
  
  if (select) query = query.select(select);
  if (lean) query = query.lean();
  
  return query;
};

/**
 * Batch fetch user profiles by user IDs
 * @param {Array<ObjectId>} userIds - Array of user IDs
 * @param {String} select - Fields to select
 * @returns {Promise<Array>} Array of user profiles
 */
export const batchGetUserProfiles = async (userIds, select = 'user name title location phone profileImage') => {
  return UserProfile.find({ user: { $in: userIds } })
    .select(select)
    .lean();
};

/**
 * Batch fetch company profiles by company IDs
 * @param {Array<ObjectId>} companyIds - Array of company IDs
 * @param {String} select - Fields to select
 * @returns {Promise<Array>} Array of company profiles
 */
export const batchGetCompanyProfiles = async (companyIds, select = 'company companyName logo industry') => {
  return CompanyProfile.find({ company: { $in: companyIds } })
    .select(select)
    .lean();
};

/**
 * Get user applications with optional filters
 * @param {ObjectId} userId - User ID
 * @param {Object} filters - Additional filters (status, jobId, etc.)
 * @param {Object} options - Query options (select, populate, sort, limit)
 * @returns {Promise<Array>} Array of applications
 */
export const getUserApplications = async (userId, filters = {}, options = {}) => {
  const {
    select = 'jobId status appliedAt resume coverLetter',
    populate = [],
    sort = { createdAt: -1 },
    limit = null,
  } = options;

  let query = Application.find({ userId, ...filters }).select(select);

  if (Array.isArray(populate) && populate.length > 0) {
    populate.forEach((pop) => query = query.populate(pop));
  }

  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);

  return query.lean();
};

/**
 * Get job applications for a specific job
 * @param {ObjectId} jobId - Job ID
 * @param {Object} filters - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of applications
 */
export const getJobApplications = async (jobId, filters = {}, options = {}) => {
  const {
    select = 'userId status appliedAt resume coverLetter',
    populate = [],
    sort = { createdAt: -1 },
    limit = null,
  } = options;

  let query = Application.find({ jobId, ...filters }).select(select);

  if (Array.isArray(populate) && populate.length > 0) {
    populate.forEach((pop) => query = query.populate(pop));
  }

  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);

  return query.lean();
};

/**
 * Get user's saved jobs
 * @param {ObjectId} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of saved jobs
 */
export const getUserSavedJobs = async (userId, options = {}) => {
  const {
    select = 'user job createdAt',
    populate = [],
    sort = { createdAt: -1 },
    limit = null,
  } = options;

  let query = SavedJob.find({ user: userId }).select(select);

  if (Array.isArray(populate) && populate.length > 0) {
    populate.forEach((pop) => query = query.populate(pop));
  }

  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);

  return query.lean();
};

/**
 * Get user's search history
 * @param {ObjectId} userId - User ID
 * @param {Number} limit - Number of searches to return
 * @returns {Promise<Array>} Array of searches
 */
export const getUserSearchHistory = async (userId, limit = 50) => {
  return Search.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get company's posted jobs
 * @param {ObjectId} companyId - Company ID
 * @param {Object} filters - Additional filters (status, etc.)
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of jobs
 */
export const getCompanyJobs = async (companyId, filters = {}, options = {}) => {
  const {
    select = '',
    populate = [],
    sort = { createdAt: -1 },
    limit = null,
  } = options;

  let query = Job.find({ companyId, ...filters });

  if (select) query = query.select(select);

  if (Array.isArray(populate) && populate.length > 0) {
    populate.forEach((pop) => query = query.populate(pop));
  }

  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);

  return query.lean();
};

/**
 * Get notifications for user or company
 * @param {String} actorType - 'user' or 'company'
 * @param {ObjectId} actorId - User or Company ID
 * @param {Object} filters - Additional filters (isRead, type, etc.)
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of notifications
 */
export const getNotifications = async (actorType, actorId, filters = {}, options = {}) => {
  const {
    select = 'type title message isRead createdAt data priority',
    populate = [],
    sort = { priority: -1, createdAt: -1 },
    limit = null,
  } = options;

  const query_filter = actorType === 'company' 
    ? { companyId: actorId, ...filters }
    : { userId: actorId, ...filters };

  let query = Notification.find(query_filter).select(select);

  if (Array.isArray(populate) && populate.length > 0) {
    populate.forEach((pop) => query = query.populate(pop));
  }

  if (sort) query = query.sort(sort);
  if (limit) query = query.limit(limit);

  return query.lean();
};

/**
 * Check if user has applied to a job
 * @param {ObjectId} userId - User ID
 * @param {ObjectId} jobId - Job ID
 * @returns {Promise<Boolean>} True if applied, false otherwise
 */
export const hasUserAppliedToJob = async (userId, jobId) => {
  const application = await Application.findOne({ userId, jobId }).select('_id').lean();
  return !!application;
};

/**
 * Check if user has saved a job
 * @param {ObjectId} userId - User ID
 * @param {ObjectId} jobId - Job ID
 * @returns {Promise<Boolean>} True if saved, false otherwise
 */
export const hasUserSavedJob = async (userId, jobId) => {
  const savedJob = await SavedJob.findOne({ user: userId, job: jobId }).select('_id').lean();
  return !!savedJob;
};

/**
 * Get user's related data (experience, education, certificates)
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object>} Object with experience, education, certificates arrays
 */
export const getUserRelatedData = async (userId) => {
  const [experience, education, certificates] = await Promise.all([
    Experience.find({ user: userId }).select('-__v').lean(),
    Education.find({ user: userId }).select('-__v').lean(),
    Certificate.find({ user: userId }).select('-__v').lean(),
  ]);

  return { experience, education, certificates };
};

/**
 * Delete all user related data (used in cascade deletes)
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object>} Deletion results
 */
export const deleteUserRelatedData = async (userId) => {
  const results = await Promise.all([
    Experience.deleteMany({ user: userId }),
    Education.deleteMany({ user: userId }),
    Certificate.deleteMany({ user: userId }),
  ]);

  return {
    experienceDeleted: results[0].deletedCount,
    educationDeleted: results[1].deletedCount,
    certificatesDeleted: results[2].deletedCount,
  };
};

/**
 * Create a map of user profiles by user ID for fast lookup
 * @param {Array<Object>} profiles - Array of user profiles
 * @returns {Map} Map with userId as key and profile data as value
 */
export const createUserProfileMap = (profiles) => {
  const profileMap = new Map();
  profiles.forEach(profile => {
    profileMap.set(profile.user.toString(), profile);
  });
  return profileMap;
};

/**
 * Create a map of company profiles by company ID for fast lookup
 * @param {Array<Object>} profiles - Array of company profiles
 * @returns {Map} Map with companyId as key and profile data as value
 */
export const createCompanyProfileMap = (profiles) => {
  const profileMap = new Map();
  profiles.forEach(profile => {
    profileMap.set(profile.company.toString(), profile);
  });
  return profileMap;
};

/**
 * Get user profile with email (joins with User model)
 * @param {ObjectId} userId - User ID
 * @param {String} profileSelect - Fields to select from profile
 * @returns {Promise<Object>} Profile with email
 */
export const getUserProfileWithEmail = async (userId, profileSelect = '') => {
  const User = (await import('../models/User.js')).default;
  
  const [profile, user] = await Promise.all([
    getUserProfile(userId, profileSelect),
    User.findById(userId).select('email').lean(),
  ]);

  return {
    ...profile,
    email: user?.email || '',
  };
};

export default {
  getUserProfile,
  getUserCompleteProfile,
  getCompanyProfile,
  batchGetUserProfiles,
  batchGetCompanyProfiles,
  getUserApplications,
  getJobApplications,
  getUserSavedJobs,
  getUserSearchHistory,
  getCompanyJobs,
  getNotifications,
  hasUserAppliedToJob,
  hasUserSavedJob,
  getUserRelatedData,
  deleteUserRelatedData,
  createUserProfileMap,
  createCompanyProfileMap,
  getUserProfileWithEmail,
};
