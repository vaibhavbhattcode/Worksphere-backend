// controllers/searchController.js
import Search from "../models/Search.js";

// Extended stop words list for better filtering
const stopWords = new Set([
  // Common English stop words
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 
  'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'will', 'with', 'i', 'me', 
  'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 
  'yourselves', 'him', 'his', 'her', 'hers', 'herself', 'they', 'them', 'their', 'theirs', 
  'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 
  'do', 'does', 'did', 'doing', 'would', 'should', 'could', 'ought', 'im', 'youre', 
  'hes', 'shes', 'its', 'were', 'theyre', 'ive', 'youve', 'weve', 'theyve', 
  'id', 'youd', 'hed', 'shed', 'wed', 'theyd', 'ill', 'youll', 'hell', 
  'shell', 'well', 'theyll',
  
  // Common job search related generic terms
  'job', 'jobs', 'work', 'career', 'position', 'role', 'employment', 'hiring', 'looking',
  'find', 'search', 'want', 'need', 'get', 'apply', 'application', 'opportunity',
  'opportunities', 'opening', 'openings', 'vacancy', 'vacancies', 'available',
  
  // Common location terms
  'near', 'nearby', 'location', 'city', 'state', 'country', 'remote', 'onsite',
  
  // Common salary/experience terms
  'salary', 'pay', 'income', 'wage', 'experience', 'exp', 'year', 'years',
  'entry', 'mid', 'senior', 'executive', 'level',
  
  // Common job type terms
  'full', 'part', 'contract', 'intern', 'internship', 'temporary', 'temp',
  'freelance', 'freelancer', 'consultant', 'consulting',
  
  // Common skill level terms
  'beginner', 'intermediate', 'advanced', 'expert', 'proficient', 'skilled',
  
  // Common company terms
  'company', 'corporation', 'corp', 'inc', 'llc', 'ltd', 'organization', 'org',
  
  // Common industry terms
  'industry', 'sector', 'field', 'domain', 'area',
  
  // Common time terms
  'now', 'today', 'tomorrow', 'yesterday', 'week', 'month', 'year', 'urgent',
  
  // Common numbers and symbols
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'first', 'second', 'third', '1st', '2nd', '3rd', 'etc', 'so', 'very', 'just',
  
  // Common question words
  'how', 'what', 'where', 'when', 'why', 'who', 'which', 'can', 'could', 'should',
  'would', 'may', 'might', 'must', 'shall', 'will', 'do', 'does', 'did', 'done'
]);

// Common job title patterns to validate search terms
const validJobTitlePatterns = [
  /\bdeveloper\b/i, /\bengineer\b/i, /\bmanager\b/i, /\bdesigner\b/i, /\banalyst\b/i,
  /\bconsultant\b/i, /\bspecialist\b/i, /\bcoordinator\b/i, /\bsupervisor\b/i, /\bdirector\b/i,
  /\barchitect\b/i, /\bscientist\b/i, /\bresearcher\b/i, /\btechnician\b/i, /\badministrator\b/i,
  /\bassistant\b/i, /\bassociate\b/i, /\blead\b/i, /\bsenior\b/i, /\bjunior\b/i,
  /\bfront.end\b/i, /\bback.end\b/i, /\bfull.stack\b/i, /\bsoftware\b/i, /\bweb\b/i,
  /\bdata\b/i, /\bmachine.learning\b/i, /\bdevops\b/i, /\bcloud\b/i, /\bcybersecurity\b/i,
  /\bnetwork\b/i, /\bdatabase\b/i, /\bsystem\b/i, /\bit\b/i, /\bsupport\b/i,
  /\bmarketing\b/i, /\bsales\b/i, /\bfinance\b/i, /\baccountant\b/i, /\bhr\b/i,
  /\bhuman.resources\b/i, /\brecruiter\b/i, /\bcontent\b/i, /\bwritter\b/i, /\beditor\b/i,
  /\bproduct\b/i, /\bproject\b/i, /\bscrum\b/i, /\bagile\b/i, /\bqa\b/i,
  /\bquality.assurance\b/i, /\btester\b/i, /\bux\b/i, /\bui\b/i, /\bgraphic\b/i,
  /\bmotion\b/i, /\b3d\b/i, /\bgis\b/i, /\bseo\b/i, /\bdigital\b/i
];

export const storeSearch = async (req, res) => {
  try {
    const { query } = req.body;
    
    // Only store meaningful searches (at least 2 characters)
    if (!query || query.trim().length < 2) {
      return res.status(200).json({ message: "Search query too short" });
    }
    
    const cleanedQuery = query.trim().toLowerCase();
    
    // Split into words and filter out stop words and single characters
    const words = cleanedQuery.split(/\s+/).filter(word => {
      // Filter out words with less than 2 characters
      if (word.length < 2) return false;
      
      // Filter out stop words
      if (stopWords.has(word)) return false;
      
      // Filter out common patterns that don't add value
      if (/^\d+$/.test(word)) return false; // Pure numbers
      if (/^[\d\W]+$/.test(word)) return false; // Only numbers and special characters
      
      return true;
    });
    
    // If no meaningful words remain, don't store the search
    if (words.length === 0) {
      return res.status(200).json({ message: "Search query contains only stop words or invalid terms" });
    }
    
    // Additional validation: Check if search contains job-related terms
    // This helps ensure we're storing job-relevant searches
    const hasJobRelatedTerm = words.some(word => 
      validJobTitlePatterns.some(pattern => pattern.test(word))
    );
    
    // If no job-related terms and search is very short, don't store
    if (!hasJobRelatedTerm && words.length < 2) {
      return res.status(200).json({ message: "Search query not job-related" });
    }
    
    // Limit search query length to prevent abuse
    if (cleanedQuery.length > 100) {
      return res.status(400).json({ message: "Search query too long" });
    }
    
    // Check for duplicate recent searches (within last hour) to prevent spam
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentDuplicate = await Search.findOne({
      query: cleanedQuery,
      createdAt: { $gte: oneHourAgo },
      user: req.user ? req.user.id : null
    });
    
    if (recentDuplicate) {
      return res.status(200).json({ message: "Search query already recorded recently" });
    }
    
    // Store the search
    const search = new Search({ 
      query: cleanedQuery, 
      user: req.user ? req.user.id : null 
    });
    await search.save();
    
    res.status(201).json({ message: "Search stored successfully" });
  } catch (err) {
    console.error("Error storing search:", err);
    res.status(500).json({ message: "Failed to store search" });
  }
};

// Cleanup old search records (older than 90 days) and keep analytics
export const cleanupSearches = async () => {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    // Delete old searches
    const result = await Search.deleteMany({ 
      createdAt: { $lt: ninetyDaysAgo } 
    });
    
    console.log(`[Search Cleanup] Removed ${result.deletedCount} old search records`);
    
    // Optional: Return analytics on remaining searches
    const totalSearches = await Search.countDocuments();
    console.log(`[Search Analytics] Total active searches: ${totalSearches}`);
    
    // Additional analytics: Get top 10 most common search terms
    const topSearches = await Search.aggregate([
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    console.log(`[Search Analytics] Top 10 searches:`, topSearches);
    
    return { 
      deleted: result.deletedCount, 
      remaining: totalSearches,
      topSearches: topSearches
    };
  } catch (err) {
    console.error("Error cleaning up searches:", err);
  }
};

// Get popular search terms
export const getPopularSearches = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const limit = parseInt(req.query.limit) || 10;
    
    // Validate parameters
    if (days < 1 || days > 365) {
      return res.status(400).json({ message: "Days must be between 1 and 365" });
    }
    
    if (limit < 1 || limit > 100) {
      return res.status(400).json({ message: "Limit must be between 1 and 100" });
    }
    
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    // Aggregate search terms and count occurrences
    const popularSearches = await Search.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);
    
    // Add percentage relative to total searches in the period
    const totalInPeriod = await Search.countDocuments({
      createdAt: { $gte: since }
    });
    
    const result = popularSearches.map(search => ({
      query: search._id,
      count: search.count,
      percentage: totalInPeriod > 0 ? ((search.count / totalInPeriod) * 100).toFixed(2) : 0
    }));
    
    res.status(200).json({
      data: result,
      total: totalInPeriod,
      days: days
    });
  } catch (err) {
    console.error("Error getting popular searches:", err);
    res.status(500).json({ message: "Failed to get popular searches" });
  }
};