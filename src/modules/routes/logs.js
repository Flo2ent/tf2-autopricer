const fs = require("fs");
const path = require("path");
const renderPage = require("../layout");

const LOG_FILES = ["tf2-autopricer-out.log", "tf2-autopricer-error.log"];

module.exports = (app, config) => {
  const pm2LogDir = path.join(
    process.env.HOME || process.env.USERPROFILE,
    ".pm2",
    "logs"
  );

  app.get("/logs", (req, res) => {
    const file = req.query.file || "tf2-autopricer-out.log";

    if (!LOG_FILES.includes(file)) {
      return res.status(400).send("Invalid log file requested.");
    }

    const logPath = path.join(pm2LogDir, file);

    fs.readFile(logPath, "utf8", (err, data) => {
      const buttons = LOG_FILES.map(
        (f) => `<a href="/logs?file=${f}"><button>${f}</button></a>`
      ).join(" ");

      if (err) {
        const html = `<p>Error reading log: ${file}</p><pre>${err.message}</pre>`;
        return res.send(renderPage("Logs", `${buttons}<hr>${html}`));
      }

      const html = `
        ${buttons}
        <hr>
        <pre id="logbox">${data.slice(-15000)}</pre>
        <script>
          setTimeout(() => {
            window.location.reload();
          }, 500000);
        </script>
      `;

      res.send(renderPage(`Logs - ${file}`, html));
    });
  });
};
