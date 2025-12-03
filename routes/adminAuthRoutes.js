import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

const router = express.Router();

// Admin Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    console.log("Admin login request received:", { email });
    console.log("Checking database for admin user...");
    console.log("Login request received with email:", email);
    console.log("Checking if admin exists in the database...");

    // Check if the admin exists in the database (check both isAdmin and role for security)
    const admin = await User.findOne({ 
      email, 
      $or: [{ isAdmin: true }, { role: "admin" }]
    }).select("+password");
    
    if (!admin) {
      console.log("Admin not found for email:", email);
      return res.status(404).json({ message: "Admin not found" });
    }

    // Verify the user is actually an admin
    if (!admin.isAdmin && admin.role !== "admin") {
      console.log("User is not an admin:", email);
      return res.status(403).json({ message: "Access denied: Not an admin" });
    }

    // Check if account is active
    if (admin.isActive === false) {
      console.log("Admin account is deactivated:", email);
      return res.status(403).json({ message: "Account is deactivated" });
    }

    // Validate the password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      console.log("Invalid password for admin:", email);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate a JWT token
    const token = jwt.sign(
      { _id: admin._id, email: admin.email, isAdmin: true, role: admin.role || "admin" },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      }
    );

    console.log("Admin login successful:", email);
    res.json({ 
      token, 
      admin: { 
        id: admin._id, 
        email: admin.email,
        isAdmin: true,
        role: admin.role || "admin"
      } 
    });
  } catch (error) {
    console.error("Error during admin login:", error);
    console.error("Full error stack:", error.stack);
    res.status(500).json({ message: "Server error", error });
  }
});

// Route to add an admin user
router.post("/add", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if the admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the admin user
    const adminUser = new User({
      name,
      email,
      password: hashedPassword,
      isAdmin: true,
      role: "admin",
    });

    await adminUser.save();
    res.status(201).json({ message: "Admin user created successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error creating admin user", error });
  }
});

export default router;
