/**
 * Vercel serverless entry point.
 *
 * Vercel turns every file under /api into a function. Exporting the Express app
 * lets the whole router tree run behind one function — `server.js` only calls
 * app.listen() when executed directly, so importing it here never binds a port.
 */
module.exports = require('../backend/server.js');
