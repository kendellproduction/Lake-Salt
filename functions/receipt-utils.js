function deriveTaxYear(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  if (isNaN(Date.parse(dateStr))) {
    return null;
  }
  const year = parseInt(dateStr.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function isDuplicateReceipt(parsed, existingExpenses) {
  if (!parsed || !Array.isArray(existingExpenses)) {
    return false;
  }

  const parsedMerchant = parsed.merchant ? String(parsed.merchant).trim().toLowerCase() : null;
  const parsedTotal = parsed.total;
  const parsedDate = parsed.date;

  // Missing data never duplicates
  if (!parsedMerchant || parsedTotal === null || parsedTotal === undefined || !parsedDate) {
    return false;
  }

  // parsedTotal must be a finite number
  if (!Number.isFinite(parsedTotal)) {
    return false;
  }

  // Parse the parsed date to check validity
  if (isNaN(Date.parse(parsedDate))) {
    return false;
  }

  const parsedDateObj = new Date(parsedDate);

  for (const existing of existingExpenses) {
    if (!existing) continue;

    const existingMerchant = existing.merchant ? String(existing.merchant).trim().toLowerCase() : null;
    const existingAmount = existing.amount;
    const existingDate = existing.date;

    // Missing data in existing never duplicates
    if (!existingMerchant || existingAmount === null || existingAmount === undefined || !existingDate) {
      continue;
    }

    // existingAmount must be a finite number
    if (!Number.isFinite(existingAmount)) {
      continue;
    }

    // Parse the existing date to check validity
    if (isNaN(Date.parse(existingDate))) {
      continue;
    }

    // Check merchant match (case/whitespace-insensitive)
    if (parsedMerchant !== existingMerchant) {
      continue;
    }

    // Check amount match
    if (parsedTotal !== existingAmount) {
      continue;
    }

    // Check date match: ±1 day tolerance
    const existingDateObj = new Date(existingDate);
    const dayDiff = Math.floor((parsedDateObj - existingDateObj) / (1000 * 60 * 60 * 24));
    if (Math.abs(dayDiff) <= 1) {
      return true;
    }
  }

  return false;
}

module.exports = { isDuplicateReceipt, deriveTaxYear };
