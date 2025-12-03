// utils/jobValidator.js
// Advanced validation utilities for job management

import validator from 'validator';

/**
 * Validate and sanitize job title
 * @param {string} title - Job title to validate
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export const validateJobTitle = (title) => {
  if (!title || typeof title !== 'string') {
    return { valid: false, error: 'Job title is required' };
  }
  
  const sanitized = validator.trim(title);
  
  if (sanitized.length < 3) {
    return { valid: false, error: 'Job title must be at least 3 characters' };
  }
  
  if (sanitized.length > 100) {
    return { valid: false, error: 'Job title cannot exceed 100 characters' };
  }
  
  // Check for suspicious patterns
  const suspiciousPatterns = /(<script|javascript:|onerror=|onclick=)/i;
  if (suspiciousPatterns.test(sanitized)) {
    return { valid: false, error: 'Job title contains invalid characters' };
  }
  
  return { valid: true, sanitized };
};

/**
 * Validate salary range
 * @param {number} min - Minimum salary
 * @param {number} max - Maximum salary
 * @param {string} currency - Currency code
 * @returns {Object} { valid: boolean, error: string }
 */
export const validateSalaryRange = (min, max, currency) => {
  if (min == null || max == null) {
    return { valid: false, error: 'Both minimum and maximum salary are required' };
  }
  
  if (typeof min !== 'number' || typeof max !== 'number') {
    return { valid: false, error: 'Salary must be a number' };
  }
  
  if (min < 0 || max < 0) {
    return { valid: false, error: 'Salary cannot be negative' };
  }
  
  if (min > max) {
    return { valid: false, error: 'Minimum salary cannot exceed maximum salary' };
  }
  
  // Validate reasonable salary ranges (adjust based on your needs)
  const maxReasonableSalary = 10000000; // 10 million
  if (min > maxReasonableSalary || max > maxReasonableSalary) {
    return { valid: false, error: 'Salary amount exceeds reasonable limits' };
  }
  
  // Validate currency code
  if (currency && currency.length !== 3) {
    return { valid: false, error: 'Currency code must be 3 characters (e.g., USD, EUR)' };
  }
  
  return { valid: true };
};

/**
 * Validate application deadline
 * @param {Date|string} deadline - Application deadline
 * @param {number} minDaysAhead - Minimum days in the future (default: 1)
 * @param {number} maxDaysAhead - Maximum days in the future (default: 365)
 * @returns {Object} { valid: boolean, date: Date, error: string }
 */
export const validateApplicationDeadline = (deadline, minDaysAhead = 1, maxDaysAhead = 365) => {
  if (!deadline) {
    return { valid: false, error: 'Application deadline is required' };
  }
  
  const date = new Date(deadline);
  
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }
  
  const now = new Date();
  const minDate = new Date(now.getTime() + minDaysAhead * 24 * 60 * 60 * 1000);
  const maxDate = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60 * 1000);
  
  if (date < minDate) {
    return { valid: false, error: `Deadline must be at least ${minDaysAhead} day(s) in the future` };
  }
  
  if (date > maxDate) {
    return { valid: false, error: `Deadline cannot be more than ${maxDaysAhead} days in the future` };
  }
  
  return { valid: true, date };
};

/**
 * Validate skills array
 * @param {Array|string} skills - Skills array or comma-separated string
 * @param {number} maxSkills - Maximum number of skills (default: 20)
 * @returns {Object} { valid: boolean, skills: Array, error: string }
 */
export const validateSkills = (skills, maxSkills = 20) => {
  let skillsArray = [];
  
  if (typeof skills === 'string') {
    skillsArray = skills.split(',').map(s => validator.trim(s)).filter(s => s.length > 0);
  } else if (Array.isArray(skills)) {
    skillsArray = skills.map(s => validator.trim(String(s))).filter(s => s.length > 0);
  } else if (!skills) {
    return { valid: true, skills: [] };
  } else {
    return { valid: false, error: 'Skills must be an array or comma-separated string' };
  }
  
  if (skillsArray.length > maxSkills) {
    return { valid: false, error: `Cannot specify more than ${maxSkills} skills` };
  }
  
  // Validate each skill
  for (const skill of skillsArray) {
    if (skill.length < 2) {
      return { valid: false, error: 'Each skill must be at least 2 characters' };
    }
    if (skill.length > 50) {
      return { valid: false, error: 'Each skill cannot exceed 50 characters' };
    }
  }
  
  return { valid: true, skills: skillsArray };
};

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {Object} { valid: boolean, normalized: string, error: string }
 */
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  const normalized = validator.normalizeEmail(email);
  
  if (!validator.isEmail(normalized)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true, normalized };
};

/**
 * Validate job description
 * @param {string} description - Job description
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export const validateDescription = (description) => {
  if (!description || typeof description !== 'string') {
    return { valid: false, error: 'Job description is required' };
  }
  
  const sanitized = validator.trim(description);
  
  if (sanitized.length < 30) {
    return { valid: false, error: 'Description must be at least 30 characters' };
  }
  
  if (sanitized.length > 5000) {
    return { valid: false, error: 'Description cannot exceed 5000 characters' };
  }
  
  return { valid: true, sanitized };
};

/**
 * Validate location
 * @param {string} location - Job location
 * @returns {Object} { valid: boolean, sanitized: string, error: string }
 */
export const validateLocation = (location) => {
  if (!location || typeof location !== 'string') {
    return { valid: false, error: 'Location is required' };
  }
  
  const sanitized = validator.trim(location);
  
  if (sanitized.length < 2) {
    return { valid: false, error: 'Location must be at least 2 characters' };
  }
  
  if (sanitized.length > 200) {
    return { valid: false, error: 'Location cannot exceed 200 characters' };
  }
  
  return { valid: true, sanitized };
};

/**
 * Check if job can be edited (not closed, recent, etc.)
 * @param {Object} job - Job object from database
 * @returns {Object} { canEdit: boolean, reason: string }
 */
export const canEditJob = (job) => {
  if (!job) {
    return { canEdit: false, reason: 'Job not found' };
  }
  
  if (job.status === 'Closed') {
    return { canEdit: false, reason: 'Cannot edit closed jobs' };
  }
  
  // Check if deadline has passed
  if (job.applicationDeadline && new Date(job.applicationDeadline) < new Date()) {
    return { canEdit: false, reason: 'Cannot edit jobs with expired deadlines' };
  }
  
  return { canEdit: true };
};

/**
 * Check if job can be deleted
 * @param {Object} job - Job object from database
 * @param {number} applicantCount - Number of applicants
 * @returns {Object} { canDelete: boolean, reason: string, requiresConfirmation: boolean }
 */
export const canDeleteJob = (job, applicantCount = 0) => {
  if (!job) {
    return { canDelete: false, reason: 'Job not found' };
  }
  
  // Jobs with applicants should require confirmation
  if (applicantCount > 0) {
    return {
      canDelete: true,
      requiresConfirmation: true,
      reason: `This job has ${applicantCount} applicant(s). Deletion will remove all applications.`
    };
  }
  
  return { canDelete: true, requiresConfirmation: false };
};

export default {
  validateJobTitle,
  validateSalaryRange,
  validateApplicationDeadline,
  validateSkills,
  validateEmail,
  validateDescription,
  validateLocation,
  canEditJob,
  canDeleteJob
};
