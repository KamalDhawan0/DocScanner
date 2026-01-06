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

    const extractUniversity = (fullText) => {
      const KEYWORDS = [
        'UNIVERSITY',
        'INSTITUTE',
        'COLLEGE',
        'SCHOOL'
      ];

      const lines = fullText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 12); // ONLY top part

      let bestMatch = null;
      let bestScore = 0;

      for (const line of lines) {
        // Skip numeric-heavy lines
        if (/\d/.test(line)) continue;
        if (line.length < 10) continue;

        let score = 0;

        // Keyword matching
        for (const keyword of KEYWORDS) {
          if (line.toUpperCase().includes(keyword)) {
            score += 5;
          }
        }

        // Length heuristic
        score += Math.min(line.length / 10, 5);

        // Capitalization heuristic
        if (line === line.toUpperCase()) score += 2;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = line;
        }
      }

      return bestMatch ? { value: bestMatch } : null;
    };

    const extractCourse = (fullText) => {

      const DEGREE_KEYWORDS = [
        'BACHELOR',
        'BACHELORS',
        'MASTER',
        'MASTERS',
        'B\\.TECH',
        'M\\.TECH',
        'BTECH',
        'MTECH',
        'ENGINEERING',
        'SCIENCE',
        'ARTS',
        'COMMERCE',
        'MBA',
        'MCA',
        'BCA',
        'PHD',
        'DOCTORATE',
        'DIPLOMA'
      ];


      const lines = fullText
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      for (const line of lines) {
        for (const keyword of DEGREE_KEYWORDS) {
          const regex = new RegExp(`\\b${keyword}\\b`, 'i');
          if (regex.test(line)) {
            // Reject false positives
            if (line.length < 15) continue;
            return { value: line };
          }
        }
      }

      return null;
    };

    const extractAdmissionYear = (fullText) => {
      const YEAR_REGEX = /\b(19|20)\d{2}\b/;

      const KEYWORDS = [
        'ADMISSION YEAR',
        'YEAR OF ADMISSION',
        'ADMITTED',
        'ENROLLED'
      ];

      const lines = fullText.split('\n');

      for (const line of lines) {
        const upper = line.toUpperCase();

        if (KEYWORDS.some(k => upper.includes(k))) {
          const match = line.match(YEAR_REGEX);
          if (match) {
            return { value: match[0] };
          }
        }
      }

      return null;
    };

    const extractPassingYear = (fullText) => {
      const YEAR_REGEX = /\b(19|20)\d{2}\b/g;

      const KEYWORDS = [
        { key: 'PASS', score: 5 },
        { key: 'PASSED', score: 5 },
        { key: 'RESULT', score: 4 },
        { key: 'EXAMINATION', score: 4 },
        { key: 'EXAM', score: 3 },
        { key: 'DECLARED', score: 3 },
        { key: 'FINAL', score: 3 },
        { key: 'GRADUATED', score: 5 }
      ];

      let bestYear = null;
      let bestScore = 0;

      const lines = fullText.split('\n');

      for (const line of lines) {
        // ❌ Skip admission-related lines
        if (/ADMISSION|ADMITTED|ENROLLED/i.test(line)) continue;

        const years = line.match(YEAR_REGEX);
        if (!years) continue;

        for (const year of years) {
          let score = 1;

          for (const k of KEYWORDS) {
            if (line.toUpperCase().includes(k.key)) {
              score += k.score;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestYear = year;
          }
        }
      }

      return bestYear ? { value: bestYear } : null;
    };

    const extractPAN = (fullText) => {
      if (!fullText) return null;

      const text = fullText.toUpperCase();

      // ✅ PAN-specific keywords (MANDATORY)
      const panKeywords = [
        'PERMANENT ACCOUNT NUMBER',
        'PAN CARD',
        'INCOME TAX DEPARTMENT'
      ];

      // Check if any PAN keyword exists
      const hasPanKeyword = panKeywords.some(keyword =>
        text.includes(keyword)
      );

      if (!hasPanKeyword) {
        // 🚫 Prevent false PAN detection from marksheets
        return null;
      }

      // Normalize text
      const normalizedText = text.replace(/[^A-Z0-9]/g, ' ');

      // PAN regex
      const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
      const matches = normalizedText.match(PAN_REGEX);

      if (!matches) return null;

      return {
        value: matches[0],
        confidence: 'HIGH'
      };
    };

    const extractNumberAfterGender = (text) => {
      if (!text) return null;

      const normalizedText = text.toUpperCase();

      const regex = /(?:MALE|FEMALE)\s*[\r\n]+([0-9 ]{10,20})/;
      const match = normalizedText.match(regex);

      if (!match) return null;

      return match[1].trim();
    };






    const sgpaData = extractGPA('SGPA');
    const cgpaData = extractGPA('CGPA');
    const universityName = extractUniversity(fullText);
    const courseName = extractCourse(fullText);
    const admissionYr = extractAdmissionYear(fullText);
    const passingYr = extractPassingYear(fullText);
    const panData = extractPAN(fullText);
    const adhaarNumber = extractNumberAfterGender(fullText);

    return res.json({
      success: 'Text extracted successfully!',
      data: fullText,
      sgpaData,
      cgpaData,
      universityName,
      courseName,
      admissionYr,
      passingYr,
      panData,
      adhaarNumber
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
