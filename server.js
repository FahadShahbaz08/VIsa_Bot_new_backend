const connectDB = require("./config/db");
const app = require("./app");

async function start() {
  await connectDB();
  const port = process.env.PORT || 4000;
  return app.listen(port, () => console.log("Server running on port", port));
}
if (require.main === module) {
  start().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
// Both recognized entry files export the request handler for serverless hosts.
module.exports = app;
module.exports.app = app;
module.exports.start = start;
