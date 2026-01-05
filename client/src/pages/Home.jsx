import React, { useState } from "react";
import "../App.css";

function Home() {
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sgpaData, setSgpaData] = useState(null);
  const [cgpaData, setCgpaData] = useState(null);
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
      setData(result.data || "");
    } catch (err) {
      setError("Server error. Please try again.");
    }
  };

  return (
    <div className="container">
      <h1>📄 Transcript Analyzer</h1>
      <p>Upload a clear image of your marksheet to extract SGPA and CGPA.</p>

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
        {sgpaData && (
          <div className="gpa-box sgpa-theme">
            <div className="gpa-label">Current SGPA</div>
            <p className="gpa-value">{sgpaData.value}</p>
          </div>
        )}

        {cgpaData && (
          <div className="gpa-box">
            <div className="gpa-label">Cumulative CGPA</div>
            <p className="gpa-value">{cgpaData.value}</p>
          </div>
        )}

        {!cgpaData && !sgpaData && data && (
          <p className="info">
            ℹ️ No GPA values detected automatically. Please check the raw text
            below.
          </p>
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
