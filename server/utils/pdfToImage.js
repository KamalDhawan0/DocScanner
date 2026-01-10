const { fromPath } = require("pdf2pic");
const path = require("path");

const convertPdfFirstPageToImage = async (pdfPath) => {
  const outputDir = path.dirname(pdfPath);

  const convert = fromPath(pdfPath, {
    density: 300,              // VERY IMPORTANT for OCR
    saveFilename: "page_1",
    savePath: outputDir,
    format: "png",
    width: 1654,               // A4 size
    height: 2339
  });

  const page = await convert(1); // ONLY FIRST PAGE
  return page.path;
};

module.exports = { convertPdfFirstPageToImage };
