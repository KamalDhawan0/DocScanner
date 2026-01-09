const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ocrSpace } = require('ocr-space-api-wrapper');
const cors = require('cors');
const dotenv = require('dotenv').config();



const app = express();


app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));



const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);



const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `file-${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Only images and PDFs allowed'));
    } else {
      cb(null, true);
    }
  }
});

//document type detection

const detectDocumentType = (text) => {
  const upper = text.toUpperCase();

  if (
    upper.includes('PERMANENT ACCOUNT NUMBER') ||
    upper.includes('INCOME TAX DEPARTMENT')
  ) return 'PAN';

  if (
    upper.includes('AADHAAR') ||
    upper.includes('UIDAI') ||
    /\b(MALE|FEMALE)\b/.test(upper)
  ) return 'AADHAAR';

  //college marksheet
  if (
    upper.includes('SGPA') ||
    upper.includes('CGPA') ||
    upper.includes('GRADE SHEET') ||
    upper.includes('SEMESTER') ||
    upper.includes('UNIVERSITY')
  ) return 'MARKSHEET';



  let tenthScore = 0;
  let twelfthScore = 0;

  // 10th indicators
  if (text.includes('SECONDARY SCHOOL EXAMINATION')) tenthScore += 3;
  if (text.includes('CLASS X')) tenthScore += 3;
  if (text.includes('SSC')) tenthScore += 2;
  if (text.includes('SSLC')) tenthScore += 2;
  if (text.includes('MATRICULATION')) tenthScore += 2;
  if (text.includes('HIGH SCHOOL')) tenthScore += 2;

  // 12th indicators
  if (text.includes('SENIOR SCHOOL CERTIFICATE')) twelfthScore += 3;
  if (text.includes('CLASS XII')) twelfthScore += 3;
  if (text.includes('HSC')) twelfthScore += 2;
  if (text.includes('INTERMEDIATE')) twelfthScore += 2;
  if (text.includes('PLUS TWO')) twelfthScore += 2;
  if (text.includes('PUC')) twelfthScore += 2;
  if (text.includes('HIGHER SECONDARY')) twelfthScore += 2;

  if (tenthScore > twelfthScore) return 'TENTH_MARKSHEET';
  if (twelfthScore > tenthScore) return 'TWELFTH_MARKSHEET';


  // marksheet
  if (
    upper.includes('SECONDARY SCHOOL EXAMINATION') ||
    upper.includes('HIGHER SECONDARY EXAMINATION') ||
    upper.includes('SENIOR SCHOOL CERTIFICATE') ||
    upper.includes('SCHOOL NAME') ||
    upper.includes('AISSE') ||
    upper.includes('AISSCE') ||
    upper.includes('BOARD OF')
  ) return 'MARKSHEET';




  return 'UNKNOWN';
};

const extractGPA = (text, type) => {
  const regex = new RegExp(`${type}\\s*[:=]?\\s*(\\d[\\.,]\\d{1,3}|\\d{2,4})`, 'i');
  const match = text.match(regex);
  if (!match) return null;

  let value = match[1].replace(',', '.');
  if (!value.includes('.') && value.length >= 2) {
    value = value[0] + '.' + value.slice(1);
  }

  return { value };
};

const extractUniversity = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 12);
  const keywords = ['UNIVERSITY', 'INSTITUTE', 'COLLEGE'];

  let best = null;
  let score = 0;

  for (const line of lines) {
    if (/\d/.test(line)) continue;
    if (line.length < 10) continue;

    let s = 0;
    keywords.forEach(k => {
      if (line.toUpperCase().includes(k)) s += 5;
    });
    if (line === line.toUpperCase()) s += 2;
    s += Math.min(line.length / 10, 5);

    if (s > score) {
      score = s;
      best = line;
    }
  }

  return best ? { value: best } : null;
};

const extractCourse = (text) => {
  const keywords = [
    'BACHELOR', 'MASTER', 'BTECH', 'MTECH', 'B.TECH', 'M.TECH',
    'MBA', 'MCA', 'BCA', 'ENGINEERING', 'SCIENCE', 'ARTS',
    'COMMERCE', 'PHD', 'DOCTORATE', 'DIPLOMA'
  ];

  for (const line of text.split('\n')) {
    for (const key of keywords) {
      if (new RegExp(`\\b${key}\\b`, 'i').test(line) && line.length > 15) {
        return { value: line.trim() };
      }
    }
  }
  return null;
};

const extractAdmissionYear = (text) => {
  const regex = /\b(19|20)\d{2}\b/;
  const keys = ['ADMISSION', 'ADMITTED', 'ENROLLED'];

  for (const line of text.split('\n')) {
    if (keys.some(k => line.toUpperCase().includes(k))) {
      const match = line.match(regex);
      if (match) return { value: match[0] };
    }
  }
  return null;
};

const extractPassingYear = (text) => {
  const regex = /\b(19|20)\d{2}\b/g;
  const keys = ['PASS', 'RESULT', 'EXAM', 'DECLARED', 'GRADUATED'];

  let best = null;
  let bestScore = 0;

  for (const line of text.split('\n')) {
    if (/ADMISSION|ENROLLED/i.test(line)) continue;

    const years = line.match(regex);
    if (!years) continue;

    for (const year of years) {
      let score = 1;
      keys.forEach(k => {
        if (line.toUpperCase().includes(k)) score += 3;
      });

      if (score > bestScore) {
        bestScore = score;
        best = year;
      }
    }
  }

  return best ? { value: best } : null;
};

const extractPAN = (text) => {
  const upper = text.toUpperCase();

  if (
    !upper.includes('PERMANENT ACCOUNT NUMBER') &&
    !upper.includes('INCOME TAX DEPARTMENT')
  ) return null;

  const match = upper.replace(/[^A-Z0-9]/g, ' ')
    .match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);

  return match ? { value: match[0] } : null;
};

const extractAadhaar = (text) => {
  const match = text.toUpperCase()
    .match(/(?:MALE|FEMALE)\s*[\r\n]+([0-9 ]{10,20})/);

  return match ? { value: match[1].trim() } : null;
};

const extractTenthStudentName = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const hasParentSection = /MOTHER|FATHER|GUARDIAN/i.test(text);

  let best = null;
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    const line = original.toUpperCase();
    let score = 0;

    // ❌ Hard rejections
    if (
      /\d/.test(line) ||
      line.length < 6 || line.length > 40 ||
      /SCHOOL|BOARD|EXAMINATION|CERTIFICATE|MARKS|SUBJECT|RESULT|GRADE/i.test(line) ||
      /MOTHER|FATHER|GUARDIAN/i.test(line)     // 🚫 reject parent lines
    ) {
      continue;
    }

    const words = line.split(' ').filter(w => w.length > 1);

    // 🚫 Reject single-word names if parent section exists
    if (hasParentSection && words.length < 2) continue;

    // 1️⃣ Strongest signal: "certify that"
    if (
      /CERTIFY/i.test(lines[i - 1] || '') ||
      /CERTIFY/i.test(lines[i - 2] || '')
    ) score += 8;

    // 2️⃣ Name label (but not parent name)
    if (
      /NAME/i.test(lines[i - 1] || '') &&
      !/MOTHER|FATHER|GUARDIAN/i.test(lines[i - 1])
    ) score += 4;

    // 3️⃣ Position before parents
    if (
      /MOTHER|FATHER|GUARDIAN/i.test(lines[i + 1] || '') ||
      /MOTHER|FATHER|GUARDIAN/i.test(lines[i + 2] || '')
    ) score += 5;

    // 4️⃣ Uppercase formatting
    if (original === original.toUpperCase()) score += 2;

    // 5️⃣ Name-like structure (2–4 words)
    if (words.length >= 2 && words.length <= 4) score += 3;

    if (score > bestScore) {
      bestScore = score;
      best = original;
    }
  }

  if (!best || bestScore < 8) return null;

  return {
    value: best
      .replace(/^[^A-Z]+/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  };
};


const extractTenthSchoolName = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let bestLine = null;
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    const line = original.toUpperCase();

    let score = 0;

    // 1️⃣ Must look like a school name
    if (/SCHOOL|VIDYALAYA|INSTITUTION|ACADEMY|COLLEGE/i.test(line)) {
      score += 5;
    } else {
      continue;
    }

    // 2️⃣ Reject document headers
    if (/EXAMINATION|CERTIFICATE|MARKS|RESULT|STATEMENT|BOARD/i.test(line)) {
      continue;
    }

    // 3️⃣ Length sanity check
    if (line.length > 15) score += 2;

    // 4️⃣ School code context (very strong signal in India)
    if (
      /\d{4,6}/.test(line) ||
      /\d{4,6}/.test(lines[i - 1] || '') ||
      /\d{4,6}/.test(lines[i + 1] || '')
    ) {
      score += 4;
    }

    // 5️⃣ Uppercase formatting (common in marksheets)
    if (original === original.toUpperCase()) score += 1;

    // 6️⃣ Prefer longer, descriptive names
    if (line.length > 30) score += 2;

    // Keep the best scoring line
    if (score > bestScore) {
      bestScore = score;
      bestLine = original;
    }
  }

  // Minimum confidence threshold
  if (!bestLine || bestScore < 6) return null;

  // 🧹 Cleanup OCR noise & addresses
  return {
    value: bestLine
      .replace("frater", "")
      .replace(/^\s*SCHOOL\s+/i, '')
      .replace(/\b\d{4,6}-?/g, '')                       // remove school code
      .replace(/\b(DISTRICT|DELHI|HARYANA|INDIA)\b/gi, '')// remove locations
      .replace(/^[^A-Z]+/i, '')                           // leading OCR junk
      .replace(/\s{2,}/g, ' ')
      .trim()
  };
};

const extractTenthResultStatus = (text) => {
  const upper = text.toUpperCase();

  if (upper.includes('PASS')) return { value: 'PASS' };
  if (upper.includes('FAIL')) return { value: 'FAIL' };

  return null;
};



app.post('/extracttextfromimage', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const claimedType = req.body.documentType; // Value from client
  const filePath = req.file.path;

  try {
    const ocr = await ocrSpace(filePath, {
      apiKey: process.env.OCR_SPACE_API_KEY,
      language: 'eng',
      OCREngine: 2
    });

    const fullText = ocr?.ParsedResults?.[0]?.ParsedText || '';
    const detectedType = detectDocumentType(fullText); // Value detected by server

    // detect mismatch
    if (claimedType && claimedType !== detectedType) {
      return res.json({
        isValid: false,
        reason: "DOCUMENT_TYPE_MISMATCH",
        detectedType,
        data: fullText
      });
    }

    let result = {
      documentType: detectedType,
      isValid: false,
      data: fullText
    };


    if (detectedType === 'MARKSHEET') {
      result.sgpaData = extractGPA(fullText, 'SGPA');
      result.cgpaData = extractGPA(fullText, 'CGPA');
      result.universityName = extractUniversity(fullText);
      result.courseName = extractCourse(fullText);
      result.admissionYr = extractAdmissionYear(fullText);
      result.passingYr = extractPassingYear(fullText);
      result.isValid = Boolean(
        result.sgpaData || result.cgpaData || result.universityName
      );
    }

    if (detectedType === 'PAN') {
      result.panData = extractPAN(fullText);
      result.isValid = Boolean(result.panData);
    }

    if (detectedType === 'AADHAAR') {
      result.adhaarNumber = extractAadhaar(fullText);
      result.isValid = Boolean(result.adhaarNumber);
    }

    // if (detectedType === 'TENTH_MARKSHEET') {
    //   result.studentName = extractStudentName(fullText);
    //   result.schoolName = extractSchoolName(fullText);
    //   result.passingYr = extractPassingYear(fullText);
    //   result.resultStatus = extractResultStatus(fullText);

    //   result.isValid = Boolean(
    //     result.studentName &&
    //     result.schoolName &&
    //     result.passingYr &&
    //     result.resultStatus
    //   );
    // }

    if (detectedType === 'TENTH_MARKSHEET') {
      result.tenthStudentName = extractTenthStudentName(fullText);
      result.tenthSchoolName = extractTenthSchoolName(fullText);
      result.tenthResultStatus = extractTenthResultStatus(fullText);

      result.isValid = Boolean(
        result.tenthStudentName &&
        result.tenthSchoolName &&
        result.tenthResultStatus
      );
    }


    return res.json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});



app.listen(5000, () => {
  console.log('🚀 Server running on http://localhost:5000');
});
