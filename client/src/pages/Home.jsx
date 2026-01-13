import React, { useState } from "react";
import "../App.css";

function Home() {
  const [file, setFile] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [documentType, setDocumentType] = useState(null);
  const [isValid, setIsValid] = useState(false);

  const [sgpaData, setSgpaData] = useState(null);
  const [cgpaData, setCgpaData] = useState(null);
  const [universityData, setUniversityData] = useState(null);
  const [courseData, setCourseData] = useState(null);
  const [admissionYearData, setAdmissionYearData] = useState(null);
  const [passingYearData, setPassingYearData] = useState(null);

  const [panData, setPanData] = useState(null);

  const [adhaarNum, setAdhaarNum] = useState(null);

  const [tenthStudentName, setTenthStudentName] = useState(null);
  const [tenthSchoolName, setTenthSchoolName] = useState(null);
  const [tenthResultStatus, setTenthResultStatus] = useState(null);
  const [tengthPassingYear, setTengthPassingYear] = useState(null);

  const [twelfthStudentName, setTwelfthStudentName] = useState(null);
  const [twelfthSchoolName, setTwelfthSchoolName] = useState(null);
  const [twelfthResultStatus, setTwelfthResultStatus] = useState(null);
  const [twelfthPassingYear, setTwelfthPassingYear] = useState(null);

  const [loading, setLoading] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState("");




  const [rawText, setRawText] = useState("");

  const API = process.env.REACT_APP_API_URL;


  /* ---------------- RESET STATE ---------------- */
  const resetState = () => {
    setError("");
    setSuccess("");
    setDocumentType(null);
    setIsValid(false);

    setSgpaData(null);
    setCgpaData(null);
    setUniversityData(null);
    setCourseData(null);
    setAdmissionYearData(null);
    setPassingYearData(null);

    setPanData(null);

    setAdhaarNum(null);

    setTengthPassingYear(null);
    setTenthSchoolName(null);
    setTenthStudentName(null);
    setTenthResultStatus(null);

    setTwelfthStudentName(null);
    setTwelfthSchoolName(null);
    setTwelfthResultStatus(null);
    setTwelfthPassingYear(null);

    setRawText("");
  };




  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedDocType) {
      setError("Please select a document type.");
      return;
    }

    if (!file) {
      setError("Please select a file.");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", selectedDocType);

    try {
      const res = await fetch(`${API}/extracttextfromimage`, {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      setRawText(result.data || "");

      console.log(result.documentType);
      console.log(result);




      // ❌ Backend error
      if (!res.ok) {
        setError(result.error || "Something went wrong");
        return;
      }

      // ❌ Document type mismatch
      if (!result.isValid && result.reason === "DOCUMENT_TYPE_MISMATCH") {
        setError(
          `Uploaded document is ${result.detectedType}, not ${selectedDocType}`
        );
        return;
      }



      // ✅ Valid document → continue processing
      setDocumentType(result.documentType);
      setIsValid(result.isValid);

      setSgpaData(result.sgpaData || null);
      setCgpaData(result.cgpaData || null);
      setUniversityData(result.universityName || null);
      setCourseData(result.courseName || null);
      setAdmissionYearData(result.admissionYr || null);
      setPassingYearData(result.passingYr || null);

      setPanData(result.panData || null);

      setAdhaarNum(result.adhaarNumber || null);

      setTenthStudentName(result.tenthStudentName || null);
      setTenthSchoolName(result.tenthSchoolName || null);
      setTengthPassingYear(result.tengthPassingYear || null);
      setTenthResultStatus(result.tenthResultStatus || null);

      setTwelfthStudentName(result.twelfthStudentName);
      setTwelfthSchoolName(result.twelfthSchoolName);
      setTwelfthResultStatus(result.twelfthResultStatus);
      setTwelfthPassingYear(result.twelfthPassingYear);


      setSuccess("Document scanned successfully");

    } catch (err) {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  /* ---------------- UI ---------------- */
  return (
    <div className="container dark">
      <h1 className="title">📄 Document Analyzer</h1>
      <p className="subtitle">
        Upload Aadhaar, PAN, or Marksheet to verify & extract details
      </p>

      <form onSubmit={handleSubmit} encType="multipart/form-data" className="upload-box">

        <select
          value={selectedDocType}
          style={{ marginRight: "10px" }}
          onChange={(e) => {
            resetState();
            setSelectedDocType(e.target.value);
          }}
          required
        >
          <option value="">Select Document Type</option>
          <option value="AADHAAR">Aadhaar</option>
          <option value="PAN">PAN</option>
          <option value="MARKSHEET">Marksheet</option>
          <option value="TENTH_MARKSHEET">10th Marksheet</option>
          <option value="TWELFTH_MARKSHEET">12th Marksheet</option>
        </select>



        <input
          type="file"
          accept="image/*,.pdf"
          required
          onChange={(e) => {
            resetState();
            const selectedFile = e.target.files[0];

            if (!selectedFile) return;

            if (selectedFile.size > 1024 * 1024) {
              setError("File size should not exceed 1024 KB (1 MB)");
              e.target.value = ""; // reset file input
              setFile(null);
              return;
            }

            setFile(selectedFile);
          }}

        />
        <button type="submit">Scan Document</button>
      </form>





      {/* STATUS MESSAGES */}
      {error && (
        <div className="alert error">
          ❌ {error}
        </div>
      )}

      {success && (
        <div className="alert success">
          ✅ {success}
        </div>
      )}

      {/* ❌ INVALID DOCUMENT */}
      {documentType && !isValid && (
        <div className="alert error">
          ⚠️ Uploaded file is <strong>not a valid {documentType}</strong> document.
        </div>
      )}

      {/* PLACEHOLDER — NEVER EMPTY */}
      {!rawText && !error && (
        <div className="placeholder">
          <p>📌 Waiting for document upload</p>
          <span>
            Supported: Aadhaar · PAN · Marksheet (Image / PDF)
          </span>
        </div>
      )}

      {/* ✅ VALID DOCUMENT */}
      {isValid && (
        <div className="gpa-container">

          {/* AADHAAR */}
          {documentType === "AADHAAR" && (
            <div className="gpa-box highlight">
              <div className="gpa-label">Aadhaar Number</div>
              <p className="gpa-value">{adhaarNum?.value}</p>
            </div>
          )}

          {/* PAN */}
          {documentType === "PAN" && (
            <div className="gpa-box highlight">
              <div className="gpa-label">PAN Number</div>
              <p className="gpa-value">{panData?.value}</p>
            </div>
          )}

          {/* MARKSHEET */}
          {documentType === "MARKSHEET" && (
            <>
              {sgpaData && (
                <div className="gpa-box">
                  <div className="gpa-label">SGPA</div>
                  <p className="gpa-value">{sgpaData.value}</p>
                </div>
              )}

              {cgpaData && (
                <div className="gpa-box">
                  <div className="gpa-label">CGPA</div>
                  <p className="gpa-value">{cgpaData.value}</p>
                </div>
              )}

              {universityData && (
                <div className="gpa-box wide">
                  <div className="gpa-label">University/Board of Education</div>
                  <p className="gpa-value">{universityData.value}</p>
                </div>
              )}

              {courseData && (
                <div className="gpa-box wide">
                  <div className="gpa-label">Course</div>
                  <p className="gpa-value">{courseData.value}</p>
                </div>
              )}

              {admissionYearData && (
                <div className="gpa-box">
                  <div className="gpa-label">Admission Year</div>
                  <p className="gpa-value">{admissionYearData.value}</p>
                </div>
              )}

              {passingYearData && (
                <div className="gpa-box">
                  <div className="gpa-label">Passing Year</div>
                  <p className="gpa-value">{passingYearData.value}</p>
                </div>
              )}
            </>
          )}

          {/* 10th  */}
          {documentType === "TENTH_MARKSHEET" && (
            <>
              {tenthStudentName && (
                <div className="gpa-box">
                  <div className="gpa-label">Student Name</div>
                  <p className="gpa-value">{tenthStudentName?.value}</p>
                </div>
              )}


              {tenthSchoolName && (
                <div className="gpa-box">
                  <div className="gpa-label">School Name</div>
                  <p className="gpa-value">{tenthSchoolName?.value}</p>
                </div>
              )}


              {tenthResultStatus && (
                <div className="gpa-box">
                  <div className="gpa-label">Result Status</div>
                  <p className="gpa-value">{tenthResultStatus.value}</p>
                </div>
              )}

              {tengthPassingYear && (
                <div className="gpa-box">
                  <div className="gpa-label">Passing Year</div>
                  <p className="gpa-value">{tengthPassingYear.value}</p>
                </div>
              )}



            </>

          )}

          {/* 12th */}
          {documentType === "TWELFTH_MARKSHEET" && (
            <>
              {twelfthStudentName && (
                <div className="gpa-box">
                  <div className="gpa-label">Student Name</div>
                  <p className="gpa-value">{twelfthStudentName?.value}</p>
                </div>
              )}


              {twelfthSchoolName && (
                <div className="gpa-box">
                  <div className="gpa-label">School Name</div>
                  <p className="gpa-value">{twelfthSchoolName?.value}</p>
                </div>
              )}

              {twelfthPassingYear && (
                <div className="gpa-box">
                  <div className="gpa-label">Passing Year</div>
                  <p className="gpa-value">{twelfthPassingYear?.value}</p>
                </div>
              )}

              {twelfthResultStatus && (
                <div className="gpa-box">
                  <div className="gpa-label">Result Status</div>
                  <p className="gpa-value">{twelfthResultStatus?.value}</p>
                </div>
              )}
            </>
          )}

        </div>
      )}



      {/* RAW OCR TEXT */}
      {rawText && (
        <div className="raw-box">
          <h3>Raw Extracted Text</h3>
          <textarea rows="12" readOnly value={rawText}></textarea>
        </div>
      )}

      {loading && (
        <div className="loader-overlay">
          <div className="loader-modal">
            <div className="document">
              <div className="scan-line"></div>
            </div>
            <p className="loader-text">Scanning document using OCR…</p>
            <p className="loader-subtext">Please wait, this may take a few seconds</p>
          </div>
        </div>
      )}


    </div>
  );

}

export default Home;
