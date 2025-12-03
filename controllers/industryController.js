// controllers/industryController.js
import Industry from "../models/Industry.js";
import { getCached, setCached } from "../utils/cacheService.js";

// Cache key constants
const CACHE_KEYS = {
  INDUSTRIES_ACTIVE: 'industries:active',
  INDUSTRIES_ALL: 'industries:all',
  INDUSTRY_BY_ID: (id) => `industry:${id}`,
};

// Cache TTL (5 minutes for industries as they don't change often)
const CACHE_TTL = 300;

// Helper to invalidate cache
const invalidateIndustryCache = () => {
  // Note: cacheService doesn't have delete, so we'll just let them expire
  // or implement a delete function in cacheService if needed
};

// Get all industries (active ones first, sorted by displayOrder)
export const getAllIndustries = async (req, res) => {
  try {
    // Check cache first
    const cached = getCached(CACHE_KEYS.INDUSTRIES_ACTIVE);
    if (cached && cached.expiry > Date.now()) {
      return res.status(200).json({
        success: true,
        count: cached.value.length,
        data: cached.value,
        cached: true,
      });
    }

    const industries = await Industry.find({ isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .select("name description icon gradient displayOrder isActive")
      .lean();

    // Cache the result
    setCached(CACHE_KEYS.INDUSTRIES_ACTIVE, industries, CACHE_TTL);

    res.status(200).json({
      success: true,
      count: industries.length,
      data: industries,
    });
  } catch (error) {
    console.error("Error fetching industries:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching industries",
    });
  }
};

// Get all industries (including inactive) - for admin use
export const getAllIndustriesAdmin = async (req, res) => {
  try {
    const industries = await Industry.find()
      .sort({ isActive: -1, displayOrder: 1, name: 1 })
      .select("name description icon gradient displayOrder isActive createdAt updatedAt")
      .lean();

    res.status(200).json({
      success: true,
      count: industries.length,
      data: industries,
    });
  } catch (error) {
    console.error("Error fetching industries:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching industries",
    });
  }
};

// Get single industry by ID
export const getIndustryById = async (req, res) => {
  try {
    const industry = await Industry.findById(req.params.id)
      .select("name description icon gradient displayOrder isActive createdAt updatedAt")
      .lean();

    if (!industry) {
      return res.status(404).json({
        success: false,
        message: "Industry not found",
      });
    }

    res.status(200).json({
      success: true,
      data: industry,
    });
  } catch (error) {
    console.error("Error fetching industry:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching industry",
    });
  }
};

// Create new industry
export const createIndustry = async (req, res) => {
  try {
    const { name, description, icon, gradient, displayOrder } = req.body;

    // Check if industry with same name already exists
    const existingIndustry = await Industry.findOne({ name: name.trim() }).lean();
    if (existingIndustry) {
      return res.status(400).json({
        success: false,
        message: "Industry with this name already exists",
      });
    }

    const newIndustry = new Industry({
      name: name.trim(),
      description: description?.trim(),
      icon: icon?.trim() || "briefcase",
      gradient: gradient?.trim() || "from-gray-500 to-gray-400",
      displayOrder: displayOrder || 0,
      isActive: true, // Default to active
      createdBy: req.user?.id,
    });

    const savedIndustry = await newIndustry.save();

    res.status(201).json({
      success: true,
      message: "Industry created successfully",
      data: savedIndustry,
    });
  } catch (error) {
    console.error("Error creating industry:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = {};
      for (let field in error.errors) {
        errors[field] = error.errors[field].message;
      }
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors,
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `${field === 'name' ? 'Industry name' : field === 'slug' ? 'Industry slug' : 'Field'} already exists`,
        errors: { [field]: `${field === 'name' ? 'Industry name' : field === 'slug' ? 'Industry slug' : field} already exists` },
      });
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      message: "Server error while creating industry",
    });
  }
};

// Update industry
export const updateIndustry = async (req, res) => {
  try {
    const { name, description, icon, gradient, isActive, displayOrder } = req.body;

    const industry = await Industry.findById(req.params.id);
    if (!industry) {
      return res.status(404).json({
        success: false,
        message: "Industry not found",
      });
    }

    // Check if name is being changed and if it conflicts with existing industry
    if (name && name.trim() !== industry.name) {
      const existingIndustry = await Industry.findOne({ name: name.trim() }).lean();
      if (existingIndustry) {
        return res.status(400).json({
          success: false,
          message: "Industry with this name already exists",
        });
      }
    }

    // Update fields
    if (name) industry.name = name.trim();
    if (description !== undefined) industry.description = description?.trim();
    if (icon !== undefined) industry.icon = icon?.trim();
    if (gradient !== undefined) industry.gradient = gradient?.trim();
    if (isActive !== undefined) industry.isActive = isActive;
    if (displayOrder !== undefined) industry.displayOrder = displayOrder;
    industry.updatedBy = req.user?.id;

    const updatedIndustry = await industry.save();

    res.status(200).json({
      success: true,
      message: "Industry updated successfully",
      data: updatedIndustry,
    });
  } catch (error) {
    console.error("Error updating industry:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = {};
      for (let field in error.errors) {
        errors[field] = error.errors[field].message;
      }
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors,
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `${field === 'name' ? 'Industry name' : field === 'slug' ? 'Industry slug' : 'Field'} already exists`,
        errors: { [field]: `${field === 'name' ? 'Industry name' : field === 'slug' ? 'Industry slug' : field} already exists` },
      });
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      message: "Server error while updating industry",
    });
  }
};

// Delete industry (soft delete by setting isActive to false)
export const deleteIndustry = async (req, res) => {
  try {
    const industry = await Industry.findById(req.params.id);
    if (!industry) {
      return res.status(404).json({
        success: false,
        message: "Industry not found",
      });
    }

    // Check if industry has associated jobs using aggregation
    const jobCountResult = await Industry.aggregate([
      {
        $match: { _id: industry._id }
      },
      {
        $lookup: {
          from: "jobs",
          localField: "_id",
          foreignField: "industry",
          as: "jobs"
        }
      },
      {
        $project: {
          jobCount: { $size: "$jobs" }
        }
      }
    ]);

    const jobCount = jobCountResult.length > 0 ? jobCountResult[0].jobCount : 0;

    if (jobCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete industry with ${jobCount} associated jobs. Consider deactivating instead.`,
      });
    }

    industry.isActive = false;
    industry.updatedBy = req.user?.id;
    await industry.save();

    res.status(200).json({
      success: true,
      message: "Industry deactivated successfully",
    });
  } catch (error) {
    console.error("Error deleting industry:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting industry",
    });
  }
};

// Get industries with job counts for analytics
export const getIndustriesWithJobCounts = async (req, res) => {
  try {
    const industries = await Industry.aggregate([
      {
        $match: { isActive: true },
      },
      {
        $lookup: {
          from: "jobs",
          localField: "_id",
          foreignField: "industry",
          as: "jobs",
        },
      },
      {
        $addFields: {
          jobCount: { $size: "$jobs" },
          openJobCount: {
            $size: {
              $filter: {
                input: "$jobs",
                cond: { $eq: ["$$this.status", "Open"] },
              },
            },
          },
        },
      },
      {
        $project: {
          jobs: 0, // Remove the jobs array from response
        },
      },
      {
        $sort: { displayOrder: 1, name: 1 },
      },
    ]);

    res.status(200).json({
      success: true,
      count: industries.length,
      data: industries,
    });
  } catch (error) {
    console.error("Error fetching industries with job counts:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching industries with job counts",
    });
  }
};
