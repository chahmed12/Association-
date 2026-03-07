function isAuthenticated(req, res, next) {
    if (req.session && req.session.loggedin) return next();
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Non autorisé' });
    }
    res.redirect('/login.html');
}

module.exports = { isAuthenticated };
