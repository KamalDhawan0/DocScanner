const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const cors = require('cors');
const { ocrSpace } = require('ocr-space-api-wrapper');

const app = express();

/* ---------------- MIDDLEWARE ---------------- */

app.use(cors()); // IMPORTANT for React
app.use(express.json());

/* ---------------- UPLOADS SETUP ---------------- */

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `file-${uuidv4()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/pdf'
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    cb(new Error('Only JPG, PNG, and PDF files are allowed'), false);
  } else {
    cb(null, true);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter
});

/* ---------------- ROUTES ---------------- */

/**
 * Health check
 */
app.get('/', (req, res) => {
  res.json({ status: 'API running' });
});

/**
 * OCR + GPA extraction
 */
app.post('/extracttextfromimage', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded'
    });
  }

  const filePath = req.file.path;

  try {
    const response = await ocrSpace(filePath, {
      apiKey: 'K85502252988957',
      language: 'eng',
      encoding: 'multipart/form-data',
      isOverlayRequired: false,
      OCREngine: 2
    });

    if (response.OCRExitCode !== 1) {
      throw new Error(response.ErrorMessage || 'OCR API error');
    }

    const fullText = response.ParsedResults?.[0]?.ParsedText || '';

    const extractGPA = (type) => {
      const regex = new RegExp(
        `${type}\\s*[:=]?\\s*(\\d[\\.,]\\d{1,3}|\\d{2,4})`,
        'i'
      );

      const match = fullText.match(regex);
      if (!match) return null;

      let value = match[1].replace(',', '.');
      if (!value.includes('.') && value.length >= 2) {
        value = value[0] + '.' + value.slice(1);
      }

      return { value };
    };

    const sgpaData = extractGPA('SGPA');
    const cgpaData = extractGPA('CGPA');

    return res.json({
      success: 'Text extracted successfully!',
      data: fullText,
      sgpaData,
      cgpaData
    });

  } catch (err) {
    console.error('OCR Error:', err.message);
    return res.status(500).json({
      error: 'Extraction failed: ' + err.message
    });
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

/* ---------------- ERROR HANDLER ---------------- */

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: err.message || 'Server error'
  });
});

/* ---------------- START SERVER ---------------- */

app.listen(5000, () =>
  console.log('🚀 API running on http://localhost:5000')
);
