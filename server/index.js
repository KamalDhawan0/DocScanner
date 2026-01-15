const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const dotenv = require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');



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


async function performOCR(filePath, isPDF = false) {
  const formData = new FormData();

  formData.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
  });

  formData.append('apikey', process.env.OCR_SPACE_API_KEY);
  formData.append('language', 'eng');
  formData.append('OCREngine', '3');
  formData.append('scale', 'true');

  // 🔥 REQUIRED FOR PDFS
  if (isPDF) {
    formData.append('filetype', 'PDF');
    formData.append('isOverlayRequired', 'false');
  }

  try {
    const response = await axios.post(
      'https://api.ocr.space/parse/image',
      formData,
      {
        headers: formData.getHeaders(),
        timeout: 90000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    if (response.data.IsErroredOnProcessing) {
      console.error("OCR Space API Error:", response.data.ErrorMessage);
      return "";
    }

    // 🔥 PDFs can return multiple pages
    const parsedResults = response.data.ParsedResults || [];

    const extractedText = parsedResults
      .map(p => p.ParsedText)
      .join('\n');

    if (!extractedText) {
      console.warn("OCR processed successfully but returned no text.");
    }

    return extractedText;

  } catch (error) {
    console.error("OCR Connection Failed:", error.response?.data || error.message);
    return "";
  }
}





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

  if (
    /^P<IND/m.test(upper) ||                       // MRZ (strongest)
    (
      upper.includes('REPUBLIC OF INDIA') &&
      (
        upper.includes('PASSPORT NO') ||
        upper.includes('DATE OF EXPIRY') ||
        upper.includes('PLACE OF ISSUE')
      )
    )
  ) {
    return 'PASSPORT';
  }

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

  // ---------------- 10th indicators ----------------
  if (text.includes('SECONDARY SCHOOL EXAMINATION')) tenthScore += 3;
  if (text.includes('CLASS X')) tenthScore += 3;
  if (text.includes('SSC')) tenthScore += 2;
  if (text.includes('SSLC')) tenthScore += 2;
  if (text.includes('MATRICULATION')) tenthScore += 2;
  if (text.includes('HIGH SCHOOL')) tenthScore += 2;
  if (text.includes('10TH')) tenthScore += 2;
  if (text.includes('MATRIC')) tenthScore += 2;
  if (text.includes('BOARD EXAM')) tenthScore += 1;
  if (text.includes('SECONDARY EXAM')) tenthScore += 1;

  // ---------------- 12th indicators ----------------
  if (text.includes('SENIOR SCHOOL CERTIFICATE')) twelfthScore += 3;
  if (text.includes('CLASS XII')) twelfthScore += 3;
  if (text.includes('HSC')) twelfthScore += 2;
  if (text.includes('INTERMEDIATE')) twelfthScore += 2;
  if (text.includes('PLUS TWO')) twelfthScore += 2;
  if (text.includes('PUC')) twelfthScore += 2;
  if (text.includes('HIGHER SECONDARY')) twelfthScore += 2;
  if (text.includes('12TH')) twelfthScore += 2;
  if (text.includes('SENIOR SECONDARY')) twelfthScore += 2;
  if (text.includes('PRE-UNIVERSITY')) twelfthScore += 1;

  if (tenthScore > twelfthScore) return 'TENTH_MARKSHEET';
  if (twelfthScore > tenthScore) return 'TWELFTH_MARKSHEET';


  // marksheet
  // if (
  //   upper.includes('SECONDARY SCHOOL EXAMINATION') ||
  //   upper.includes('HIGHER SECONDARY EXAMINATION') ||
  //   upper.includes('SENIOR SCHOOL CERTIFICATE') ||
  //   upper.includes('SCHOOL NAME') ||
  //   upper.includes('AISSE') ||
  //   upper.includes('AISSCE') ||
  //   upper.includes('BOARD OF')
  // ) return 'MARKSHEET';




  return 'UNKNOWN';
};


//Marksheet Logic

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

function extractUniversity(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/university/i.test(line)) {
      return { value: line.replace(/\s{2,}/g, " ") };
    }
  }
  return null;
}

function extractCourse(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // 1️⃣ Degree-style courses
  for (const line of lines) {
    if (/BACHELOR OF|MASTER OF/i.test(line)) {
      return { value: line };
    }
  }

  // 2️⃣ Exam-style courses (B.SC.-PART-I etc.)
  for (const line of lines) {
    const match = line.match(/\b(B\.?\s?(SC|A|COM|ED|TECH)\.?\s?-?\s?(PART|YEAR)?\s?-?\s?[IVX0-9]+)\b/i);
    if (match) {
      return { value: match[1].toUpperCase() };
    }
  }

  return null;
}


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

//Pan Logic
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


const cleanName = (text) =>
  text
    .replace(/[^A-Z\s]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();


const extractPANName = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (/NAME/i.test(lines[i]) && !/FATHER/i.test(lines[i])) {
      const candidate = lines[i + 1] || '';
      const cleaned = cleanName(candidate);

      if (cleaned.length > 4) {
        return { value: cleaned };
      }
    }
  }
  return null;
};

const extractPANFatherName = (text) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (/FATHER/i.test(lines[i])) {
      const candidate = lines[i + 1] || '';
      const cleaned = cleanName(candidate);

      if (cleaned.length > 4) {
        return { value: cleaned };
      }
    }
  }
  return null;
};

const extractPANDOB = (text) => {
  const match = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
  return match ? { value: match[0] } : null;
};


//Adhaar Logic
function extractAadhaar(text) {
  const upper = text.toUpperCase();

  // ❌ Ignore VID (16 digits)
  const withoutVID = upper.replace(/\bVID[:\s]*\d{4}\s\d{4}\s\d{4}\s\d{4}\b/g, '');

  // ✅ Aadhaar number pattern (strict)
  const match = withoutVID.match(/\b\d{4}\s\d{4}\s\d{4}\b/);

  if (!match) return null;

  return {
    value: match[0]
  };
}


function normalize(text) {
  return text
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractAadhaarName(text) {
  const clean = normalize(text);
  const lines = clean
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  let startIndex = 0;

  // Start after known headers (best-effort)
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (
      /GOVERNMENT\s+OF/.test(upper) ||
      /UNIQUE\s+IDENTIFICATION/.test(upper)
    ) {
      startIndex = i + 1;
      break;
    }
  }

  const BLOCKLIST = [
    'UNIQUE',
    'IDENTIFICATION',
    'AUTHORITY',
    'INDIA',
    'AADHAAR',
    'ADDRESS',
    'ISSUED',
    'SIGNATURE',
    'PROOF',
    'CITIZENSHIP'
  ];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    // ❌ Stop before DOB / Gender (name always before these)
    if (/DOB|DATE OF BIRTH|MALE|FEMALE/.test(upper)) break;

    // ❌ Reject institutional / authority lines (OCR-safe)
    if (/^GOVERNMENT\s+OF/.test(upper)) continue;
    if (/^UNIQUE\s+IDENTIFICATION/.test(upper)) continue;

    // ❌ Reject blocklisted content
    if (BLOCKLIST.some(w => upper.includes(w))) continue;

    // ❌ Must contain only letters and spaces
    if (!/^[A-Z ]+$/.test(upper)) continue;

    // ❌ Aadhaar names are 2–4 words only
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;

    return { value: line };
  }

  return null;
}

function extractAadhaarAddress(text) {
  const clean = normalize(text);
  const lines = clean
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  let collecting = false;
  const addressLines = [];

  for (const line of lines) {
    const upper = line.toUpperCase();

    // Start after Address label
    if (/^ADDRESS[:\-]?$/.test(upper)) {
      collecting = true;
      continue;
    }

    if (!collecting) continue;

    // Stop conditions (very important)
    if (
      /\b\d{4}\s?\d{4}\s?\d{4}\b/.test(line) || // Aadhaar number
      upper.includes('VID') ||
      upper.includes('UIDAI') ||
      upper.includes('V.UIDAI.GOV') ||
      upper.includes('UNIQUE IDENTIFICATION')
    ) {
      break;
    }

    addressLines.push(line);
  }

  if (addressLines.length === 0) return null;

  return {
    value: addressLines.join(' ')
      .replace(/\s+,/g, ',')
      .replace(/\s{2,}/g, ' ')
      .trim()
  };
}

function extractAadhaarDOB(text) {
  // Normalize OCR noise
  const clean = text.replace(/\r/g, "").replace(/\n+/g, "\n");

  const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);

  // DOB label variants
  const dobLabelRegex = /\b(DOB|D0B|DO8|Date\s*of\s*Birth)\b/i;
  const dateRegex = /\b\d{2}[\/\-]\d{2}[\/\-]\d{4}\b/;

  for (let i = 0; i < lines.length; i++) {
    if (dobLabelRegex.test(lines[i])) {
      // 1️⃣ Try same line
      const sameLineMatch = lines[i].match(dateRegex);
      if (sameLineMatch) {
        return { value: sameLineMatch[0].replace(/-/g, "/") };
      }

      // 2️⃣ Try next line
      if (lines[i + 1]) {
        const nextLineMatch = lines[i + 1].match(dateRegex);
        if (nextLineMatch) {
          return { value: nextLineMatch[0].replace(/-/g, "/") };
        }
      }
    }
  }

  return null;
}


//10th Logic

const extractTenthStudentName = (text) => {
  const cleanText = text
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  /* ===============================
     1️⃣ CERTIFY-THAT (HIGHEST PRIORITY)
     =============================== */
  const certifyPatterns = [
    /THIS IS TO CERTIFY THAT\s+([A-Z][A-Z\s]{3,40})/i,
    /CERTIFIED THAT\s+([A-Z][A-Z\s]{3,40})/i,

    /NAME OF STUDENT\s*[:\-]?\s*([A-Z][A-Z\s]{3,40})/i,
    /NAME OF THE STUDENT\s*[:\-]?\s*([A-Z][A-Z\s]{3,40})/i,
    /STUDENT NAME\s*[:\-]?\s*([A-Z][A-Z\s]{3,40})/i
  ];

  for (const pattern of certifyPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      return { value: sanitizeName(match[1]) };
    }
  }

  /* ===============================
     2️⃣ NAME LABEL BASED
     =============================== */
  const nameLabelPatterns = [
    /NAME OF (THE )?CANDIDATE\s*[:\-]?\s*([A-Z][A-Z\s]{3,40})/i,
    /STUDENT NAME\s*[:\-]?\s*([A-Z][A-Z\s]{3,40})/i,
    /CANDIDATE NAME\s*[:\-]?\s*([A-Z][A-Z\s]{3,40})/i
  ];

  for (const pattern of nameLabelPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      return { value: sanitizeName(match[2] || match[1]) };
    }
  }

  /* ===============================
     3️⃣ LINE-BEFORE-PARENT (STATE BOARDS)
     =============================== */
  const lines = text
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();

    if (
      /MOTHER|FATHER|GUARDIAN/i.test(lines[i + 1] || '') &&
      /^[A-Z\s]{5,40}$/.test(line) &&
      !/ROLL|DOB|DATE|SCHOOL|BOARD/i.test(line)
    ) {
      return { value: sanitizeName(lines[i]) };
    }
  }

  return null;
};

const sanitizeName = (name) => {
  return name
    .replace(/[^A-Z\s]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const extractTengthPassingYear = (text) => {
  const cleanText = text
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();

  /* ===============================
     1️⃣ EXAMINATION CONTEXT (STRONGEST)
     =============================== */
  const examPatterns = [
    /SECONDARY SCHOOL EXAMINATION[, ]+((19|20)\d{2})/,
    /HIGHER SECONDARY EXAMINATION[, ]+((19|20)\d{2})/,
    /MATRICULATION EXAMINATION[, ]+((19|20)\d{2})/,
    /ANNUAL EXAMINATION[, ]+((19|20)\d{2})/,
    /EXAMINATION HELD IN\s+\w+\s+((19|20)\d{2})/,
    /EXAMINATION[, ]+((19|20)\d{2})/
  ];

  for (const pattern of examPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      return { value: match[1] };
    }
  }

  /* ===============================
     2️⃣ RESULT / PASS CONTEXT
     =============================== */
  const resultPatterns = [
    /PASSED.*?((19|20)\d{2})/,
    /RESULT.*?((19|20)\d{2})/,
    /QUALIFIED.*?((19|20)\d{2})/,
    /SUCCESSFULLY COMPLETED.*?((19|20)\d{2})/
  ];

  for (const pattern of resultPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      return { value: match[1] };
    }
  }

  /* ===============================
     3️⃣ DATE OF ISSUE (LAST RESORT)
     =============================== */
  const dateMatch = cleanText.match(
    /\bDATED[: ]*\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]((19|20)\d{2}))\b/
  );

  if (dateMatch) {
    return { value: dateMatch[2] };
  }

  return null;
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


// 12th Logic
const extractTwelfthStudentName = (text) => {
  const anchors = [
    'THIS IS TO CERTIFY THAT',
    'STUDENT NAME',
    'CANDIDATE NAME',
    'NAME OF THE STUDENT'
  ];

  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const upperLine = lines[i].toUpperCase();

    if (anchors.some(a => upperLine.includes(a))) {
      // 🔑 ONLY search forward
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = lines[j]
          .replace(/[^\x00-\x7F]/g, '')   // remove Hindi / Cyrillic
          .replace(/[^A-Z\s]/gi, '')      // keep only A–Z & spaces
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (
          candidate.length >= 5 &&
          candidate.length <= 40 &&
          candidate.split(' ').length >= 2 &&
          /^[A-Z\s]+$/.test(candidate) &&
          !/ROLL|NO|NUMBER|SCHOOL|BOARD|MOTHER|FATHER|GUARDIAN|RESULT/i.test(candidate)
        ) {
          return { value: candidate };
        }
      }
    }
  }

  return null;
};

const extractTwelfthSchoolName = (text) => {
  const lines = text
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const schoolLabels = [
    /^SCHOOL$/i,
    /SCHOOL NAME/i,
    /NAME OF SCHOOL/i,
    /INSTITUTION/i,
    /VIDYALAYA/i,
    /ACADEMY/i
  ];

  /* ===============================
     🔥 0️⃣ HIGHEST PRIORITY
     NUMERIC SCHOOL CODE BASED
     =============================== */
  for (const line of lines) {
    // Matches: 85101 - SCHOOL NAME ...
    const match = line.match(/^(\d{4,6})\s*[-:]?\s*(.+)$/);
    if (match) {
      const candidate = match[2];

      // Exclude certificate headers
      if (
        !/SENIOR SCHOOL CERTIFICATE EXAMINATION|SECONDARY SCHOOL EXAMINATION|MARKS STATEMENT|CERTIFICATE/i.test(
          candidate
        )
      ) {
        const cleaned = candidate
          .replace(/[^A-Z\s\-\/]/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        if (cleaned.length > 5) {
          return { value: cleaned };
        }
      }
    }
  }

  /* ===============================
     1️⃣ AFTER "FROM"
     =============================== */
  for (let i = 0; i < lines.length; i++) {
    if (/^FROM$/i.test(lines[i])) {
      const candidate = lines[i + 1] || '';
      const cleaned = candidate
        .replace(/\d{4,6}/g, '')
        .replace(/[^A-Z\s\-\/]/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (cleaned.length > 5) {
        return { value: cleaned };
      }
    }
  }

  /* ===============================
     2️⃣ AFTER SCHOOL LABELS
     =============================== */
  for (let i = 0; i < lines.length; i++) {
    if (schoolLabels.some(pattern => pattern.test(lines[i]))) {
      const candidate = lines[i + 1] || '';
      const cleaned = candidate
        .replace(/\d{4,6}/g, '')
        .replace(/[^A-Z\s\-\/]/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (cleaned.length > 5) {
        return { value: cleaned };
      }
    }
  }

  /* ===============================
     3️⃣ FALLBACK KEYWORD LINE
     =============================== */
  for (const line of lines) {
    if (
      /SCHOOL|VIDYALAYA|INSTITUTION|ACADEMY|COLLEGE/i.test(line) &&
      !/SENIOR SCHOOL CERTIFICATE EXAMINATION|SECONDARY SCHOOL EXAMINATION/i.test(line)
    ) {
      const cleaned = line
        .replace(/\d{4,6}/g, '')
        .replace(/[^A-Z\s\-\/]/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (cleaned.length > 5) {
        return { value: cleaned };
      }
    }
  }

  return null;
};

const extractTwelfthPassingYear = (text) => {
  const upper = text.toUpperCase();

  /* ===============================
     1️⃣ EXAM TITLE (STRONGEST)
     =============================== */
  const examPatterns = [
    /SENIOR SCHOOL CERTIFICATE EXAMINATION[, ]+((19|20)\d{2})/,
    /HIGHER SECONDARY EXAMINATION[, ]+((19|20)\d{2})/,
    /INTERMEDIATE EXAMINATION[, ]+((19|20)\d{2})/,
    /PLUS TWO EXAMINATION[, ]+((19|20)\d{2})/
  ];

  for (const pattern of examPatterns) {
    const match = upper.match(pattern);
    if (match) return { value: match[1] };
  }

  /* ===============================
     2️⃣ RESULT CONTEXT
     =============================== */
  const resultMatch = upper.match(/PASSED.*?((19|20)\d{2})/);
  if (resultMatch) return { value: resultMatch[1] };

  /* ===============================
     3️⃣ DATE OF ISSUE (LAST)
     =============================== */
  const dateMatch = upper.match(/\b(\d{2})[-\/\.](\d{2})[-\/\.]((19|20)\d{2})\b/);
  if (dateMatch) return { value: dateMatch[3] };

  return null;
};

const extractTwelfthResultStatus = (text) => {
  const upper = text.toUpperCase();
  if (upper.includes('PASS')) return { value: 'PASS' };
  if (upper.includes('FAIL')) return { value: 'FAIL' };
  return null;
};

// Passport
function extractPassportGivenName(text) {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/\s*Given Name\(s\)\s*(.+)/i);
    if (match) {
      return { value: match[1].trim() };
    }
  }

  return null;
}

function extractPassportDOB(text) {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Match label (Hindi / English)
    const match = line.match(/(?:जन्मतिथि|Date of Birth)[:\/]?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (match) {
      return { value: match[1].trim() };
    }
  }

  // Fallback: Try MRZ extraction (YYMMDD -> convert)
  const mrzLine = lines.find(l => /^P</.test(l));
  if (mrzLine) {
    const mrzDOB = mrzLine.slice(44, 50); // positions in MRZ
    if (mrzDOB.match(/^\d{6}$/)) {
      const yy = mrzDOB.slice(0, 2);
      const mm = mrzDOB.slice(2, 4);
      const dd = mrzDOB.slice(4, 6);

      // Convert to DD/MM/YYYY (assume 1900–2099)
      const year = parseInt(yy, 10) <= 30 ? `20${yy}` : `19${yy}`;
      return { value: `${dd}/${mm}/${year}` };
    }
  }

  return null;
}

function extractPassportNationality(text) {
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Match bilingual label
    const match = line.match(/(?:राष्ट्रीयता|Nationality)[:\/]?\s*(?:[^\s\/]+\/\s*)?([A-Z]+)/i);
    if (match) {
      return { value: match[1].trim() };
    }
  }

  return null;
}







app.post('/extracttextfromimage', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const isPDF = req.file.mimetype === 'application/pdf';
  const claimedType = req.body.documentType;

  try {

    const fullText = await performOCR(filePath, isPDF);


    console.log(`Extracted text length: ${fullText.length}`);


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

      const sgpa = extractGPA(fullText, 'SGPA');
      const cgpa = extractGPA(fullText, 'CGPA');
      const uniName = extractUniversity(fullText);
      const courseName = extractCourse(fullText);
      const admissionYr = extractAdmissionYear(fullText);
      const passingYr = extractPassingYear(fullText);

      result.sgpaData = sgpa || "";
      result.cgpaData = cgpa || "";
      result.universityName = uniName || "";
      result.courseName = courseName || "";
      result.admissionYr = admissionYr || "";
      result.passingYr = passingYr || "";

      result.isValid = true;

    }

    if (detectedType === 'PAN') {
      const panNum = extractPAN(fullText);
      const Name = extractPANName(fullText);
      const DOB = extractPANDOB(fullText);
      const FatherName = extractPANFatherName(fullText);

      result.panData = panNum || "";
      result.panName = Name || "";
      result.panDOB = DOB || "";
      result.panFatherName = FatherName || "";

      result.isValid = true;
    }

    if (detectedType === 'AADHAAR') {
      const adharNum = extractAadhaar(fullText);
      const name = extractAadhaarName(fullText);
      const DOB = extractAadhaarDOB(fullText);
      const address = extractAadhaarAddress(fullText);

      result.adhaarNumber = adharNum || "";
      result.adhaarName = name || "";
      result.adhaarDOB = DOB || "";
      result.adhaarAddress = address || "";

      result.isValid = true;
    }

    if (detectedType === 'TENTH_MARKSHEET') {
      const studentName = extractTenthStudentName(fullText);
      const schoolName = extractTenthSchoolName(fullText);
      const resultStatus = extractTenthResultStatus(fullText);
      const passingYr = extractTengthPassingYear(fullText);

      result.tenthStudentName = studentName || "";
      result.tenthSchoolName = schoolName || "";
      result.tenthResultStatus = resultStatus || "";
      result.tengthPassingYear = passingYr || "";

      result.isValid = true;
    }

    if (detectedType === 'TWELFTH_MARKSHEET') {
      const studentName = extractTwelfthStudentName(fullText);
      const schoolName = extractTwelfthSchoolName(fullText);
      const resultStatus = extractTwelfthResultStatus(fullText);
      const passingYr = extractTwelfthPassingYear(fullText);

      result.twelfthStudentName = studentName || "";
      result.twelfthSchoolName = schoolName || "";
      result.twelfthResultStatus = resultStatus || "";
      result.twelfthPassingYear = passingYr || "";

      result.isValid = true;
    }

    if (detectedType === 'PASSPORT') {

      const name = extractPassportGivenName(fullText);
      const DOB = extractPassportDOB(fullText);
      const nationality = extractPassportNationality(fullText);

      result.passportName = name || "";
      result.passportDOB = DOB || "";
      result.passportNationality = nationality|| "";

      result.isValid = true;
    }


    return res.json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});



app.listen(5000, () => {
  console.log('🚀 Server running on http://localhost:5000');
});
