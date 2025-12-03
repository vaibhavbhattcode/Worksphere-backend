// routes/searchRoutes.js
import express from "express";
import { storeSearch, getPopularSearches } from "../controllers/searchController.js";

const router = express.Router();

router.post("/", storeSearch);
router.get("/popular", getPopularSearches);

export default router;
