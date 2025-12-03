// utils/validators.js - Centralized validation schemas
import Joi from "joi";
import validator from "validator";

// Custom Joi extension to trim and check for whitespace-only strings
export const trimString = Joi.string().trim().custom((value, helpers) => {
  if (value && value.trim().length === 0) {
    return helpers.error('string.notOnlySpaces');
  }
  return value;
}, 'Trim and validate non-empty string');

// Common validation schemas
export const emailSchema = Joi.string()
  .email()
  .lowercase()
  .required()
  .messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  });

export const passwordSchema = Joi.string()
  .min(8)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'any.required': 'Password is required'
  });

export const phoneSchema = Joi.string()
  .pattern(/^[\d\s\+\-\(\)]+$/)
  .min(10)
  .max(20)
  .required()
  .messages({
    'string.pattern.base': 'Please provide a valid phone number',
    'string.min': 'Phone number must be at least 10 digits',
    'string.max': 'Phone number cannot exceed 20 characters',
    'any.required': 'Phone number is required'
  });

// User registration schema
export const userRegisterSchema = Joi.object({
  name: Joi.string().min(2).required().messages({
    'string.min': 'Name must be at least 2 characters long',
    'any.required': 'Name is required'
  }),
  email: emailSchema,
  password: passwordSchema,
});

// User login schema
export const userLoginSchema = Joi.object({
  email: emailSchema,
  password: Joi.string().required().messages({
    'any.required': 'Password is required'
  }),
});

// Company registration schema
export const companyRegisterSchema = Joi.object({
  companyName: Joi.string().min(2).required().messages({
    'string.min': 'Company name must be at least 2 characters long',
    'any.required': 'Company name is required'
  }),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
    'any.required': 'Please confirm your password'
  }),
  phone: phoneSchema,
  companyAddress: Joi.string().required().messages({
    'any.required': 'Company address is required'
  }),
  industry: Joi.string().required().messages({
    'any.required': 'Industry is required'
  }),
  website: Joi.string().uri().optional().allow(""),
  acceptTerms: Joi.boolean().optional(),
  acceptPrivacy: Joi.boolean().optional(),
});

// Job posting schema
export const jobSchema = Joi.object({
  salaryType: Joi.string().valid('range', 'exact', 'negotiable').required(),
  payPeriod: Joi.string().valid('year', 'month', 'hour', 'day').required(),
  jobTitle: trimString
    .min(3)
    .max(100)
    .pattern(/^[a-zA-Z0-9\s&\-\|\(\)\.,'"/#]+$/)
    .required()
    .messages({
      'string.min': 'Job title must be at least 3 characters long',
      'string.max': 'Job title cannot exceed 100 characters',
      'string.notOnlySpaces': 'Job title cannot be empty or contain only spaces',
      'string.pattern.base': 'Job title can only contain letters, numbers, spaces, and special characters like &, -, |, (, ), ., ,, \' , ", /, #'
    }),
  description: trimString
    .min(30)
    .max(5000)
    .required()
    .messages({
      'string.min': 'Description must be at least 30 characters long',
      'string.max': 'Description cannot exceed 5000 characters',
      'string.notOnlySpaces': 'Description cannot be empty or contain only spaces'
    }),
  jobType: Joi.string()
    .valid("Full-time", "Part-time", "Contract", "Internship", "Temporary")
    .required(),
  location: trimString
    .required()
    .messages({
      'string.notOnlySpaces': 'Location cannot be empty or contain only spaces'
    }),
  industry: Joi.string().required(),
  remoteOption: Joi.boolean().default(false),
  skills: Joi.string().allow("", null).optional()
    .custom((value, helpers) => {
      if (!value || value.trim().length === 0) return null;
      const trimmed = value.trim();
      const skillsArray = trimmed.split(",").map((s) => s.trim()).filter(s => s.length > 0);
      if (skillsArray.length > 0) {
        const invalidSkills = skillsArray.filter(skill => skill.length < 2);
        if (invalidSkills.length > 0) {
          return helpers.error('string.invalidSkills');
        }
      }
      return value;
    })
    .messages({
      'string.invalidSkills': 'Each skill must be at least 2 characters long'
    }),
  experienceLevel: Joi.string()
    .valid("Entry-level", "Mid-level", "Senior", "Executive", null, "")
    .allow(null, "")
    .optional(),
  applicationDeadline: Joi.date()
    .greater("now")
    .allow(null)
    .optional(),
  salaryRange: Joi.string().allow("", null).optional(),
  exactSalary: Joi.number().allow(null).optional()
    .when('salaryType', { is: 'exact', then: Joi.number().min(0).required() }),
  minSalary: Joi.number().allow(null).optional()
    .when('salaryType', { is: 'range', then: Joi.number().min(0).required() }),
  maxSalary: Joi.number().allow(null).optional()
    .when('salaryType', { is: 'range', then: Joi.number().min(0).required() }),
  currency: Joi.alternatives().conditional('salaryType', {
    is: 'negotiable',
    then: Joi.any().optional().allow(null, ''),
    otherwise: Joi.string().uppercase().length(3).required()
  }),
  benefits: Joi.string().allow("", null).max(2000).optional(),
  responsibilities: Joi.string().allow("", null).max(3000).optional(),
  qualifications: Joi.string().allow("", null).max(3000).optional(),
}).custom((value, helpers) => {
  const { salaryType, minSalary, maxSalary, exactSalary } = value;
  if (salaryType === 'range') {
    if (minSalary == null || maxSalary == null) {
      return helpers.error('any.custom', { message: 'Both min and max salary are required for range' });
    }
    if (maxSalary <= minSalary) {
      return helpers.error('custom.salaryRange');
    }
  }
  if (salaryType === 'exact') {
    if (exactSalary == null) {
      return helpers.error('any.custom', { message: 'Exact salary is required' });
    }
  }
  return value;
}).messages({
  'custom.salaryRange': 'Maximum salary must be greater than minimum salary'
}).unknown(true);

// Application schema
export const applicationSchema = Joi.object({
  jobId: Joi.string().required().messages({
    'any.required': 'Job ID is required'
  }),
  coverLetter: Joi.string().allow("", null).max(2000).optional(),
});

// Sanitization helper
export const sanitize = (str) => {
  if (typeof str !== "string") return str;
  return validator.escape(validator.stripLow(str.trim(), true));
};

// Validation middleware factory
export const validate = (schema) => {
  return (req, res, next) => {
    console.log('📝 Validation Request Body:', JSON.stringify(req.body, null, 2));
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(detail => detail.message);
      console.log('❌ Validation Errors:', errors);
      return res.status(400).json({ 
        success: false,
        message: errors[0],
        errors 
      });
    }
    req.validatedBody = value;
    console.log('✅ Validation Passed');
    next();
  };
};

export default {
  trimString,
  emailSchema,
  passwordSchema,
  phoneSchema,
  userRegisterSchema,
  userLoginSchema,
  companyRegisterSchema,
  jobSchema,
  applicationSchema,
  sanitize,
  validate,
};
