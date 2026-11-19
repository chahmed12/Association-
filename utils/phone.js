function normalizePhone(value) {
    if (value === null || value === undefined) return null;
    let digits = String(value).replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    return digits;
}

module.exports = { normalizePhone };
