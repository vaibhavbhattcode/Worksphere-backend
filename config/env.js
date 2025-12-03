import Joi from "joi";

// Allow a sensible local default for Mongo in non-production
const localMongoDefault =
  process.env.NODE_ENV === "production"
    ? undefined
    : "mongodb://127.0.0.1:27017/work-sphere";

// Define environment schema with sensible defaults
const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().port().default(5000),

  // Database
  MONGO_URI: (localMongoDefault
    ? Joi.string().uri({ scheme: ["mongodb", "mongodb+srv"] }).default(localMongoDefault)
    : Joi.string().uri({ scheme: ["mongodb", "mongodb+srv"] }).required()),

  // Sessions (separate secrets for different roles; defaults are acceptable for local dev only)
  SESSION_SECRET: Joi.string().min(8).default("default_secret"),
  SESSION_SECRET_COMPANY: Joi.string().min(8).default("default_company_secret"),
  SESSION_SECRET_ADMIN: Joi.string().min(8).default("default_admin_secret"),

  // CORS
  FRONTEND_URL: Joi.string().uri().default("http://localhost:3000"),

  // OAuth (optional)
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  // Admin JWT
  JWT_SECRET: (process.env.NODE_ENV === "production"
    ? Joi.string().min(16).required()
    : Joi.string().min(8).default("dev-secret-change-me")),
}).unknown(true);

const { error, value } = envSchema.validate(process.env, { abortEarly: false });

if (error) {
  console.error("❌ Invalid environment configuration:\n", error.details.map(d => d.message).join("\n"));
  process.exit(1);
}

// Export normalized env if needed
export const env = {
  NODE_ENV: value.NODE_ENV,
  PORT: value.PORT,
  MONGO_URI: value.MONGO_URI,
  SESSION_SECRET: value.SESSION_SECRET,
  SESSION_SECRET_COMPANY: value.SESSION_SECRET_COMPANY,
  SESSION_SECRET_ADMIN: value.SESSION_SECRET_ADMIN,
  FRONTEND_URL: value.FRONTEND_URL,
  GOOGLE_CLIENT_ID: value.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: value.GOOGLE_CLIENT_SECRET,
};

export default env;
