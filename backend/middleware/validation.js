const CATEGORIES = [
  'Development', 'Testing', 'Documentation', 'Design',
  'Maintenance', 'Support', 'Meeting', 'Other',
];

/**
 * Validates one timesheet payload. Returns an array of human-readable errors
 * (empty when valid). Used for both single and bulk inserts so an OCR import
 * can never write a half-filled row.
 */
function validateTimesheet(body, { index } = {}) {
  const errors = [];
  const prefix = index != null ? `Row ${index + 1}: ` : '';

  if (!body.date) {
    errors.push(`${prefix}date is required`);
  } else {
    const d = new Date(body.date);
    if (Number.isNaN(d.getTime())) errors.push(`${prefix}date is not a valid date`);
    else {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (d > today) errors.push(`${prefix}date cannot be in the future`);
    }
  }

  if (!body.taskName || !String(body.taskName).trim()) {
    errors.push(`${prefix}taskName is required`);
  }

  if (!body.category) {
    errors.push(`${prefix}category is required`);
  } else if (!CATEGORIES.includes(body.category)) {
    errors.push(`${prefix}category must be one of: ${CATEGORIES.join(', ')}`);
  }

  const hours = Number(body.hours);
  if (!body.hours && body.hours !== 0) errors.push(`${prefix}hours is required`);
  else if (Number.isNaN(hours)) errors.push(`${prefix}hours must be a number`);
  else if (hours <= 0) errors.push(`${prefix}hours must be greater than 0`);
  else if (hours > 24) errors.push(`${prefix}hours cannot exceed 24 in a day`);

  // Postgres returns TIME columns as HH:MM:SS, so seconds must be accepted here —
  // otherwise re-validating an existing row on update always fails.
  const timeRe = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
  if (body.startTime && !timeRe.test(body.startTime)) errors.push(`${prefix}startTime must be HH:MM`);
  if (body.endTime && !timeRe.test(body.endTime)) errors.push(`${prefix}endTime must be HH:MM`);

  if (body.status && !['Draft', 'Submitted', 'Approved', 'Rejected'].includes(body.status)) {
    errors.push(`${prefix}status is invalid`);
  }

  return errors;
}

function validateLogin(body) {
  const errors = [];
  if (!body.email || !/^\S+@\S+\.\S+$/.test(body.email)) errors.push('Valid email is required');
  if (!body.password || body.password.length < 4) errors.push('Password is required');
  return errors;
}

module.exports = { validateTimesheet, validateLogin, CATEGORIES };
