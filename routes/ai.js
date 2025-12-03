import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

import UserProfile from "../models/UserProfile.js";
import Experience from "../models/Experience.js";
import Education from "../models/Education.js";
import Certificate from "../models/Certificate.js";
import Skill from "../models/Skill.js";

import { requireUserJwt } from "../middleware/authJwt.js";

/** 🔹 POST /api/ai/generate-about */
router.post("/generate-about", async (req, res) => {
  const { jobTitle, skills } = req.body;

  const skillsArray = Array.isArray(skills)
    ? skills
    : skills
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  if (!jobTitle || !skillsArray?.length) {
    return res
      .status(400)
      .json({ error: "Job title and skills are required." });
  }

  const prompt = `Generate a professional 'About Me' section for a job seeker with the title '${jobTitle}' and skills: ${skillsArray.join(
    ", "
  )}. Keep it concise, human-readable, under 100 words, and without markdown.`;

  try {
    let text = await geminiGenerateText(prompt);

    const words = text.split(/\s+/);
    if (words.length > 100) text = words.slice(0, 100).join(" ") + "...";

    res.json({ about: text });
  } catch (err) {
    console.error("AI Error (generate-about):", {
      message: err.message,
      stack: err.stack,
      response: err.response?.data,
    });
    res.status(500).json({ error: "Failed to generate About Me text." });
  }
});

/** 🔹 POST /api/ai/career-suggestions */
router.post("/career-suggestions", requireUserJwt, async (req, res) => {
  const { skills = [], experience = [] } = req.body;

  if (!skills.length && !experience.length) {
    return res
      .status(400)
      .json({ message: "Skills or experience must be provided." });
  }

  const experienceText = experience
    .map((e) => `${e.position || ""} at ${e.company || ""}`)
    .join("; ");

  const prompt = `
You are a career coach AI.
Based on these skills: ${skills.join(", ")}
And experience: ${experienceText}
Suggest:
- 3 suitable job roles
- 3 trending/advanced skills to learn
- 3 useful online courses with platforms and benefits
Format each section as a bullet list.
`;

  try {
    const suggestions = await geminiGenerateText(prompt);
    res.status(200).json({ suggestions });
  } catch (err) {
    console.error("AI Error (career-suggestions):", {
      message: err.message,
      stack: err.stack,
      response: err.response?.data,
    });
    res.status(500).json({ message: "Failed to generate career suggestions." });
  }
});

/** 🔹 POST /api/ai/trending-skills */
router.post("/trending-skills", async (req, res) => {
  const { year } = req.body;
  const prompt = `List exactly 6 top trending tech skills for ${year}. For each, provide:\n- Skill Name\n- A direct clickable online course link (with course name as the link text, not just the URL)\nFormat as:\nSkill: <Skill Name>\nCourse: <Course Name> - <Course URL>\n(Separate each skill with a blank line)`;
  try {
    // In-memory cache to mitigate rate-limit; kept module-scoped
    if (!global.__trendingSkillsCache) {
      global.__trendingSkillsCache = new Map();
    }
    const cacheKey = String(year || new Date().getFullYear());
    const cacheTTLms = 60 * 60 * 1000; // 1 hour TTL
    const now = Date.now();
    const cached = global.__trendingSkillsCache.get(cacheKey);
    if (cached && now - cached.fetchedAt < cacheTTLms) {
      return res.status(200).json({ suggestions: cached.data, cached: true, source: "cache" });
    }

    const suggestions = await geminiGenerateText(prompt);
    global.__trendingSkillsCache.set(cacheKey, { data: suggestions, fetchedAt: now });
    res.status(200).json({ suggestions, cached: false, source: "live" });
  } catch (err) {
    console.error("AI Error (trending-skills):", {
      message: err.message,
      stack: err.stack,
      response: err.response?.data,
    });
    const isRateLimited = err.response?.status === 429 || err.response?.data?.error?.code === 429;
    if (isRateLimited) {
      const { year } = req.body;
      const cacheKey = String(year || new Date().getFullYear());
      const cached = global.__trendingSkillsCache?.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          suggestions: cached.data,
          cached: true,
          source: "cache",
          warning: "AI provider rate-limited; served cached result.",
        });
      }
      return res.status(429).json({
        message: "AI rate limit reached. Please retry shortly.",
        status: "RESOURCE_EXHAUSTED",
      });
    }
    res.status(502).json({ message: "Failed to generate trending skills from AI service.", error: err.message });
  }
});

// List available Gemini models for debugging
router.get("/list-models", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  try {
    const response = await axios.get(url);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// Helper for Gemini API
async function geminiGenerateText(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  // Use gemini-2.0-flash model
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  const response = await axios.post(url, body, {
    headers: { "Content-Type": "application/json" },
  });
  // Gemini returns candidates[0].content.parts[0].text
  return (
    response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    response.data?.candidates?.[0]?.content?.text ||
    response.data?.candidates?.[0]?.output ||
    response.data ||
    "Unable to generate text."
  );
}

export default router;
