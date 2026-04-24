const { CanvasFactory } = require("pdf-parse/worker");
const { PDFParse } = require("pdf-parse");

async function extractTextFromPDFBuffer(buffer) {
  const parser = new PDFParse({ data: buffer, CanvasFactory });

  try {
    const result = await parser.getText();
    return (result?.text || "").trim();
  } finally {
    if (typeof parser.destroy === "function") {
      await parser.destroy();
    }
  }
}

module.exports = {
  extractTextFromPDFBuffer
};