// middleware/actorMiddleware.js
// Detects whether the request is from a logged-in job seeker (User) or a Company.
// Exposes req.actor = { type: "user"|"company", id: ObjectId }

export function resolveActor(req, res, next) {
  try {
    // Passport sessions populate req.user for both domains but we are using separate session middlewares
    // For user routes, req.session and req.user represent job seeker
    // For company routes, req.session and req.user represent company

    // Prefer explicit flags that other middlewares may set; otherwise infer from URL prefix
    const isCompanyPath = req.baseUrl?.startsWith("/api/company") || req.originalUrl?.startsWith("/api/company");

    if (isCompanyPath) {
      const company = req.user || req.company; // passport may set req.user
      if (!company?._id) return res.status(401).json({ message: "Not authenticated as company" });
      req.actor = { type: "company", id: company._id };
      return next();
    }

    const user = req.user;
    if (!user?._id) return res.status(401).json({ message: "Not authenticated as user" });
    req.actor = { type: "user", id: user._id };
    return next();
  } catch (err) {
    return res.status(500).json({ message: "Failed to resolve actor" });
  }
}


