import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function signToken(payload, options = {}) {
  const { expiresIn = "7d" } = options;
  return jwt.sign(payload, SECRET, { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

export function signUserToken(user) {
  return signToken({ sub: user._id.toString(), type: "user", email: user.email, role: user.role || "jobSeeker" });
}

export function signCompanyToken(company) {
  return signToken({ sub: company._id.toString(), type: "company", email: company.email });
}

export default { signToken, verifyToken, signUserToken, signCompanyToken };
