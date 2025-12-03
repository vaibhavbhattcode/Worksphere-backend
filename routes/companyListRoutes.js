import express from "express";
import mongoose from "mongoose";
import Company from "../models/Company.js";
import CompanyProfile from "../models/CompanyProfile.js";

const router = express.Router();

// GET all companies using their profile data
router.get("/", async (req, res) => {
  try {
    // Retrieves all company profiles; adjust fields if needed
    const companies = await CompanyProfile.find().lean();
    res.status(200).json(companies);
  } catch (err) {
    console.error("Error fetching companies:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET a single company's full profile for public view
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Validate ObjectId format first
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid company ID" });
    }

    // 1) Try treating :id as a Company _id
    let company = await Company.findById(id).lean();
    let profile = null;

    if (company) {
      profile = await CompanyProfile.findOne({ company: company._id }).lean();
    } else {
      // 2) Fallback: treat :id as a CompanyProfile _id (legacy links)
      profile = await CompanyProfile.findById(id).lean();
      if (profile) {
        company = await Company.findById(profile.company).lean();
      }
    }

    if (!company && !profile) {
      return res.status(404).json({ message: "Company not found" });
    }

    const data = {
      ...(company || {}),
      ...(profile || {}),
    };

    return res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching company profile:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
