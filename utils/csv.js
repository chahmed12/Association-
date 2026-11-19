const { Buffer } = require('node:buffer');

function escapeCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function csvBuffer(headers, rows) {
    const lines = [headers.map(escapeCell).join(',')];
    rows.forEach(row => {
        lines.push(row.map(escapeCell).join(','));
    });
    return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

module.exports = { csvBuffer };
