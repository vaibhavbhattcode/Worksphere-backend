// utils/dbService.js
import Job from '../models/Job.js';
import UserProfile from '../models/UserProfile.js';
import Search from '../models/Search.js';
import Industry from '../models/Industry.js';
import CompanyProfile from '../models/CompanyProfile.js';
import Applicant from '../models/Application.js';

/**
 * Reusable function to fetch jobs with common population and filtering.
 * @param {Object} query - MongoDB query object.
 * @param {Object} options - Options like sort, skip, limit, populate.
 * @returns {Promise<Array>} - Array of job objects.
 */
export const getJobsWithPopulation = async (query = {}, options = {}) => {
  const {
    sort = { createdAt: -1 },
    skip = 0,
    limit = 0,
    populate = [],
    select = null,
    lean = true,
  } = options;

  let jobQuery = Job.find(query).sort(sort);
  if (select) jobQuery = jobQuery.select(select);
  if (skip > 0) jobQuery = jobQuery.skip(skip);
  if (limit > 0) jobQuery = jobQuery.limit(limit);
  if (lean) jobQuery = jobQuery.lean();

  populate.forEach((pop) => {
    // Support lean populate projection
    jobQuery = jobQuery.populate(pop);
  });

  return await jobQuery;
};

/**
 * Extract keywords from user profile and searches for recommendations.
 * @param {String} userId - User ID.
 * @returns {Promise<Set>} - Set of keywords.
 */
export const getUserKeywords = async (userId) => {
  const keywords = new Set();
  const profile = await UserProfile.findOne({ user: userId })
    .select('skills')
    .populate({ path: 'skills', select: 'name' })
    .lean();
  if (profile && Array.isArray(profile.skills)) {
    profile.skills.forEach((skill) => skill?.name && keywords.add(skill.name.toLowerCase()));
  }

  const searches = await Search.find({ user: userId }).select('query').lean();
  searches.forEach((search) => {
    if (typeof search.query === 'string') {
      search.query
        .split(' ')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean)
        .forEach((word) => keywords.add(word));
    }
  });

  return keywords;
};

/**
 * Build job query from filters.
 * @param {Object} filters - Filter options.
 * @returns {Object} - MongoDB query object.
 */
export const buildJobQuery = (filters) => {
  const query = { status: 'Open', applicationDeadline: { $gte: new Date() } };
  const { search, location, jobType, remote, experience, industry, datePosted } = filters;

  if (search) {
    query.$or = [
      { jobTitle: new RegExp(search, 'i') },
      { location: new RegExp(search, 'i') },
      { skills: new RegExp(search, 'i') },
    ];
  }

  if (location) query.location = new RegExp(location, 'i');
  if (jobType && jobType !== 'any') query.jobType = jobType;
  if (remote && remote !== 'any') query.remoteOption = remote === 'true';
  if (experience && experience !== 'any') query.experienceLevel = experience;

  if (industry && industry !== 'any') {
    // Assuming industry is a string of names, convert to IDs
    // This should be handled in controller if needed
  }

  if (datePosted && datePosted !== 'any') {
    const now = new Date();
    let cutoff;
    if (datePosted === '24h') cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    else if (datePosted === 'week') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (datePosted === 'month') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (cutoff) query.createdAt = { $gte: cutoff };
  }

  return query;
};

/**
 * Paginate results with enforced limits.
 * @param {Array} results - Array of items.
 * @param {Number} page - Current page.
 * @param {Number} limit - Items per page (capped at 50).
 * @returns {Object} - Paginated response.
 */
export const paginate = (results, page, limit) => {
  const maxLimit = 50; // Enforce max limit to prevent large responses
  const safeLimit = Math.min(limit, maxLimit); // Cap at 50
  const total = results.length;
  const totalPages = Math.ceil(total / safeLimit);
  const startIndex = (page - 1) * safeLimit;
  const endIndex = startIndex + safeLimit;
  const paginatedResults = results.slice(startIndex, endIndex);

  return {
    results: paginatedResults,
    pagination: {
      currentPage: page,
      totalPages,
      total,
      limit: safeLimit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};
