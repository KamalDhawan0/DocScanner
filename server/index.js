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

/* ---------- NAME CLEANER ---------- */
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



async function performOCR(filePath, isPDF = false) {
  const formData = new FormData();

  formData.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
  });

  formData.append('apikey', process.env.OCR_SPACE_API_KEY);
  formData.append('language', 'eng');
  formData.append('OCREngine', '2');
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
      result.panData = panNum || "";

      result.isValid = true;
    }

    if (detectedType === 'AADHAAR') {
      const adharNum = extractAadhaar(fullText);
      result.adhaarNumber = adharNum || "";

      result.isValid = true;
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



    return res.json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});



app.listen(5000, () => {
  console.log('🚀 Server running on http://localhost:5000');
});
