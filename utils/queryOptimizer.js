/**
 * Database Query Optimization Utilities
 * Provides reusable query builders with automatic performance optimizations
 */

/**
 * Common field selections for different models
 * Only fetch fields that are actually needed
 */
export const FIELD_SELECTIONS = {
  user: {
    minimal: 'email role isActive',
    basic: 'email role isActive createdAt',
    profile: 'email role isActive name avatar',
  },
  userProfile: {
    minimal: 'user name title',
    basic: 'user name title location phone profileImage',
    full: 'user name title location phone skills education experience profileImage resume',
  },
  company: {
    minimal: 'email role isActive',
    basic: 'email role isActive createdAt verified',
  },
  companyProfile: {
    minimal: 'company companyName logo',
    basic: 'company companyName logo industry description',
    full: 'company companyName logo industry description website location',
  },
  job: {
    minimal: 'jobTitle status companyId',
    list: 'jobTitle jobType location industry skills status createdAt applicationDeadline salary salaryType payPeriod companyId remoteOption experienceLevel',
    detail: 'jobTitle jobType location industry skills status createdAt applicationDeadline salary salaryType payPeriod companyId remoteOption experienceLevel description responsibilities requirements benefits',
  },
  application: {
    minimal: 'userId jobId status',
    basic: 'userId jobId status appliedAt resume coverLetter',
    full: 'userId jobId status appliedAt resume coverLetter expectedSalary availableFrom',
  },
  notification: {
    basic: 'userId type message isRead createdAt',
    full: 'userId type message isRead createdAt jobId companyId applicationId',
  },
  interview: {
    basic: 'jobId userId date status mode',
    full: 'jobId userId date status mode meetingLink venue feedback',
  },
  industry: {
    minimal: 'name icon',
    full: 'name icon gradient description',
  },
  skill: {
    minimal: 'name',
    full: 'name category level',
  },
};

/**
 * Optimized populate configurations
 * Combines path, select, and options for better performance
 */
export const POPULATE_CONFIGS = {
  userBasic: { path: 'userId', select: 'email role isActive' },
  userProfile: { path: 'userId', select: 'email' },
  companyBasic: { path: 'companyId', select: 'email role' },
  companyProfile: { path: 'companyProfile', select: 'companyName logo' },
  companyProfileBasic: { path: 'company', select: 'email verified' },
  jobMinimal: { path: 'jobId', select: 'jobTitle status companyId' },
  jobList: { path: 'jobId', select: FIELD_SELECTIONS.job.list },
  industryFull: { path: 'industry', select: FIELD_SELECTIONS.industry.full },
  skillsMinimal: { path: 'skills', select: 'name' },
};

/**
 * Build optimized query with automatic .lean() and field selection
 * @param {Model} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Object} options - Query options
 * @returns {Query} Optimized query
 */
export const buildOptimizedQuery = (Model, filter = {}, options = {}) => {
  const {
    select = '',
    populate = [],
    sort = {},
    limit = null,
    skip = null,
    lean = true,
  } = options;

  let query = Model.find(filter);

  // Apply field selection
  if (select) query = query.select(select);

  // Apply sorting
  if (Object.keys(sort).length > 0) query = query.sort(sort);

  // Apply pagination
  if (limit) query = query.limit(limit);
  if (skip) query = query.skip(skip);

  // Apply populate
  if (Array.isArray(populate) && populate.length > 0) {
    populate.forEach((pop) => {
      query = query.populate(pop);
    });
  } else if (populate && typeof populate === 'object') {
    query = query.populate(populate);
  }

  // Always use lean for read-only queries
  if (lean) query = query.lean();

  return query;
};

/**
 * Build optimized findOne query
 * @param {Model} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Object} options - Query options
 * @returns {Query} Optimized query
 */
export const buildOptimizedFindOne = (Model, filter = {}, options = {}) => {
  const { select = '', populate = [], lean = true } = options;

  let query = Model.findOne(filter);

  if (select) query = query.select(select);

  if (Array.isArray(populate) && populate.length > 0) {
    populate.forEach((pop) => {
      query = query.populate(pop);
    });
  } else if (populate && typeof populate === 'object') {
    query = query.populate(populate);
  }

  if (lean) query = query.lean();

  return query;
};

/**
 * Build optimized findById query
 * @param {Model} Model - Mongoose model
 * @param {String} id - Document ID
 * @param {Object} options - Query options
 * @returns {Query} Optimized query
 */
export const buildOptimizedFindById = (Model, id, options = {}) => {
  const { select = '', populate = [], lean = true } = options;

  let query = Model.findById(id);

  if (select) query = query.select(select);

  if (Array.isArray(populate) && populate.length > 0) {
    populate.forEach((pop) => {
      query = query.populate(pop);
    });
  } else if (populate && typeof populate === 'object') {
    query = query.populate(populate);
  }

  if (lean) query = query.lean();

  return query;
};

/**
 * Build optimized count query
 * @param {Model} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @returns {Query} Count query
 */
export const buildOptimizedCount = (Model, filter = {}) => {
  return Model.countDocuments(filter);
};

/**
 * Execute multiple queries in parallel for better performance
 * @param {Array} queries - Array of query objects
 * @returns {Promise} Promise.all result
 */
export const executeParallelQueries = async (queries) => {
  return Promise.all(queries);
};

/**
 * Build paginated query with optimizations
 * @param {Model} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Object} paginationOptions - Pagination options
 * @returns {Promise} Paginated result with metadata
 */
export const buildPaginatedQuery = async (Model, filter = {}, paginationOptions = {}) => {
  const {
    page = 1,
    limit = 10,
    select = '',
    populate = [],
    sort = { createdAt: -1 },
  } = paginationOptions;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    buildOptimizedQuery(Model, filter, { select, populate, sort, limit, skip }),
    buildOptimizedCount(Model, filter),
  ]);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
};

/**
 * Common query patterns for frequently used operations
 */
export const queryPatterns = {
  /**
   * Get active jobs with company info
   */
  getActiveJobs: (filter = {}) => {
    return buildOptimizedQuery(
      Job,
      { status: 'Open', applicationDeadline: { $gte: new Date() }, ...filter },
      {
        select: FIELD_SELECTIONS.job.list,
        populate: [POPULATE_CONFIGS.companyProfile, POPULATE_CONFIGS.industryFull],
        sort: { createdAt: -1 },
      }
    );
  },

  /**
   * Get user with profile
   */
  getUserWithProfile: (userId) => {
    return buildOptimizedFindById(User, userId, {
      select: FIELD_SELECTIONS.user.basic,
      populate: {
        path: 'profile',
        select: FIELD_SELECTIONS.userProfile.full,
      },
    });
  },

  /**
   * Get company with profile
   */
  getCompanyWithProfile: (companyId) => {
    return buildOptimizedFindById(Company, companyId, {
      select: FIELD_SELECTIONS.company.basic,
      populate: {
        path: 'profile',
        select: FIELD_SELECTIONS.companyProfile.full,
      },
    });
  },

  /**
   * Get applications for job with user details
   */
  getJobApplications: (jobId) => {
    return buildOptimizedQuery(
      Application,
      { jobId },
      {
        select: FIELD_SELECTIONS.application.full,
        populate: [
          POPULATE_CONFIGS.userProfile,
          { path: 'jobId', select: 'jobTitle companyId' },
        ],
        sort: { appliedAt: -1 },
      }
    );
  },
};

/**
 * Cache wrapper for frequently accessed data
 * Integrates with existing cacheService
 */
export const withCache = async (cacheKey, queryFn, ttl = 300) => {
  try {
    // Import dynamically to avoid circular dependencies
    const { getCached, setCached } = await import('./cacheService.js');
    
    const cached = getCached(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    const result = await queryFn();
    setCached(cacheKey, result, ttl);
    return result;
  } catch (error) {
    // If cache fails, still execute the query
    return queryFn();
  }
};

/**
 * Batch fetch multiple documents by IDs
 * More efficient than multiple findById calls
 */
export const batchFetchByIds = async (Model, ids, options = {}) => {
  return buildOptimizedQuery(
    Model,
    { _id: { $in: ids } },
    options
  );
};

/**
 * Get unique values for a field (useful for filters)
 */
export const getUniqueValues = async (Model, field, filter = {}) => {
  return Model.distinct(field, filter);
};

export default {
  FIELD_SELECTIONS,
  POPULATE_CONFIGS,
  buildOptimizedQuery,
  buildOptimizedFindOne,
  buildOptimizedFindById,
  buildOptimizedCount,
  executeParallelQueries,
  buildPaginatedQuery,
  queryPatterns,
  withCache,
  batchFetchByIds,
  getUniqueValues,
};
