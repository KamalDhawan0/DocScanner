import React, { useState } from "react";
import "../App.css";

function Home() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sgpaData, setSgpaData] = useState(null);
  const [cgpaData, setCgpaData] = useState(null);
  const [universityData, setUniversityData] = useState(null);
  const [courseData, setCourseData] = useState(null);
  const [admissionYearData, setAdmissionYearData] = useState(null);
  const [passingYearData, setPassingYearData] = useState(null);
  const [panData, setPanData] = useState(null);
  const [adhaarNum, setAdhaarNum] = useState(null);

  const [data, setData] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      setError("Please select a file.");
      return;
    }

    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://localhost:5000/extracttextfromimage", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Something went wrong");
        return;
      }


      setSuccess(result.success || "Transcript analyzed successfully");
      setSgpaData(result.sgpaData || null);
      setCgpaData(result.cgpaData || null);
      setUniversityData(result.universityName || null);
      setCourseData(result.courseName || null);
      setAdmissionYearData(result.admissionYr || null);
      setPassingYearData(result.passingYr || null);
      setPanData(result.panData || null);
      setAdhaarNum(result.adhaarNumber || null);
      setData(result.data || "");
    } catch (err) {
      setError("Server error. Please try again.");
    }
  };

  return (
    <div className="container">
      <h1>📄 Transcript Analyzer</h1>
      <p>Upload a clear image.</p>

      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <label>
          <strong>Step 1:</strong> Select Transcript Image
        </label>
        <br />
        <br />
        <input
          type="file"
          accept="image/*,.pdf"
          required
          onChange={(e) => setFile(e.target.files[0])}
        />
        <br />
        <br />
        <button type="submit">Analyze Transcript</button>
      </form>

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {success && <div className="success">✅ {success}</div>}

      <div className="gpa-container">

        {/* 1️⃣ Adhaar */}
        {adhaarNum ? (
          <div className="gpa-box">
            <div className="gpa-label">Adhaar Card Number</div>
            <p className="gpa-value">{adhaarNum}</p>
          </div>

        ) : panData ? (
          /* 2️⃣ PAN Mode */
          <div className="gpa-box">
            <div className="gpa-label">PAN Number</div>
            <p className="gpa-value">{panData.value}</p>
          </div>

        ) : (
          /* 3️⃣ Marksheet / Academic Mode */
          <>
            {/* SGPA */}
            {sgpaData && (
              <div className="gpa-box sgpa-theme">
                <div className="gpa-label">Current SGPA</div>
                <p className="gpa-value">{sgpaData.value}</p>
              </div>
            )}

            {/* CGPA */}
            {cgpaData && (
              <div className="gpa-box">
                <div className="gpa-label">Cumulative CGPA</div>
                <p className="gpa-value">{cgpaData.value}</p>
              </div>
            )}

            {/* University */}
            {universityData && (
              <div className="gpa-box">
                <div className="gpa-label">University Name</div>
                <p className="gpa-value">{universityData.value}</p>
              </div>
            )}

            {/* Course */}
            {courseData && (
              <div className="gpa-box">
                <div className="gpa-label">Course Name</div>
                <p className="gpa-value">{courseData.value}</p>
              </div>
            )}

            {/* Admission Year */}
            {admissionYearData && (
              <div className="gpa-box">
                <div className="gpa-label">Admission Year</div>
                <p className="gpa-value">{admissionYearData.value}</p>
              </div>
            )}

            {/* Passing Year */}
            {passingYearData && (
              <div className="gpa-box">
                <div className="gpa-label">Passing Year</div>
                <p className="gpa-value">{passingYearData.value}</p>
              </div>
            )}

            {/* Info messages */}
            {!cgpaData && !sgpaData && data && (
              <p className="info">
                ℹ️ No GPA values detected automatically. Please check the raw text below.
              </p>
            )}

            {!universityData && data && (
              <p className="info">
                ℹ️ No University Name detected automatically. Please check the raw text below.
              </p>
            )}

            {!courseData && data && (
              <p className="info">
                ℹ️ No Course Name detected automatically. Please check the raw text below.
              </p>
            )}

            {!admissionYearData && data && (
              <p className="info">
                ℹ️ No Admission Year detected automatically. Please check the raw text below.
              </p>
            )}

            {!passingYearData && data && (
              <p className="info">
                ℹ️ No Passing Year detected automatically. Please check the raw text below.
              </p>
            )}
          </>
        )}

      </div>



      {data && (
        <>
          <h3>Raw Extracted Text:</h3>
          <textarea rows="12" readOnly value={data}></textarea>
        </>
      )}
    </div>
  );
}

export default Home;
