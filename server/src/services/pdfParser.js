const { execFile } = require("child_process");
const path = require("path");

const SCRIPT = path.join(__dirname, "parse_pdf.py");
const PYTHON = process.env.PYTHON_BIN || "python3";

function parsePdf(filePath) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [SCRIPT, filePath], { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || err.message));
      }
      try {
        const data = JSON.parse(stdout);
        if (data.error) return reject(new Error(data.error));
        resolve(data);
      } catch (e) {
        reject(new Error("Failed to parse PDF parser output: " + e.message));
      }
    });
  });
}

module.exports = { parsePdf };
