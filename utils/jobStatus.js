// backend/utils/jobStatus.js
// Utility to compute a unified effective job status based on stored status and deadline.
// Three-state model:
//   1. Open            -> status==='Open' AND (no deadline OR deadline in future)
//   2. DeadlineReached -> status==='Open' BUT deadline has passed
//   3. Closed          -> status==='Closed' (manually closed by admin/company)
// Job seekers should only see jobs with effectiveStatus === 'Open'.

export const getEffectiveStatus = (job) => {
  if (!job) return 'Closed';
  const stored = job.status === 'Open' ? 'Open' : 'Closed';
  if (stored === 'Open' && job.applicationDeadline) {
    const deadline = new Date(job.applicationDeadline);
    if (!isNaN(deadline.getTime()) && deadline < new Date()) {
      return 'DeadlineReached';
    }
  }
  return stored; // Open or Closed
};

export const annotateJobWithEffectiveStatus = (job) => {
  if (!job) return job;
  const effectiveStatus = getEffectiveStatus(job);
  return {
    ...job,
    effectiveStatus,
  };
};

export default { getEffectiveStatus, annotateJobWithEffectiveStatus };