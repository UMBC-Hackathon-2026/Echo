"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage, asApiError } from "@/lib/client/api";
import { EXTRACTION_FAILURE, MAX_FILES, pdfProblem } from "@/lib/topics/upload-policy";

const DEMO_HELPER = process.env.NEXT_PUBLIC_DEMO_HELPER === "true";

export default function Home() {
  const router = useRouter();
  const [topicName, setTopicName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (selectedFiles: File[]) => {
    setError(null);
    if (selectedFiles.length + files.length > MAX_FILES) {
      setError(`You can only upload up to ${MAX_FILES} PDFs.`);
      return;
    }

    let firstProblem: string | null = null;
    const existing = new Set(files.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    const validFiles = selectedFiles.filter((file) => {
      const problem = pdfProblem(file);
      if (problem) {
        firstProblem ??= problem;
        return false;
      }
      return !existing.has(`${file.name}:${file.size}:${file.lastModified}`);
    });

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
    if (firstProblem) setError(firstProblem);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addFiles(Array.from(e.target.files));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!topicName.trim()) {
      setError("Please provide a topic name.");
      return;
    }
    if (files.length === 0) {
      setError("Please upload at least one PDF.");
      return;
    }

    setBusy(true);
    setFailed(false);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("topicName", topicName);
      files.forEach(f => formData.append("files", f));
      
      const { topicId } = await api.createTopic(formData);
      
      const dto = await api.createSession({ topicId });
      router.push(`/session/${dto.sessionId}`);
    } catch (e: unknown) {
      setError(apiErrorMessage(asApiError(e), EXTRACTION_FAILURE));
      setFailed(true);
      setBusy(false);
    }
  }

  async function startDemo() {
    setBusy(true);
    setFailed(false);
    setError(null);
    try {
      const dto = await api.createSession();
      router.push(`/session/${dto.sessionId}`);
    } catch (e: unknown) {
      setError(apiErrorMessage(asApiError(e), "Could not start the recursion demo."));
      setBusy(false);
    }
  }

  if (busy || failed) {
    return (
      <main className="home-shell home-state-shell">
        <section className="processing-card">
          {busy && <div aria-hidden="true" className="processing-spinner"><span /></div>}
          <p className="home-kicker">{failed ? "Setup needs attention" : "Building your lesson"}</p>
          <h1 aria-live="polite">{failed ? "We couldn't prepare your lesson" : "Analyzing your materials…"}</h1>
          {failed ? <>
            <p role="alert" className="home-state-copy">{error}</p>
            <button type="button" className="secondary-button" onClick={() => { setFailed(false); setError(null); }}>Review documents and try again</button>
          </> : <>
            <p className="home-state-copy">Extracting core concepts, common misconceptions, and building a private assessment rubric.</p>
            <div className="processing-steps" aria-hidden="true"><span className="active" /><span /><span /></div>
            <p className="home-state-note">Please keep this page open while your documents are processed.</p>
          </>}
        </section>
      </main>
    );
  }

  return (
    <main className="home-shell">
      <section className="home-intro">
        <p className="home-kicker">Learn by teaching</p>
        <Image src="/echo-logo.png" alt="" width={56} height={56} priority className="echo-mark" />
        <h1>Echo</h1>
        <p>Turn your own study materials into a learner you can teach, assess, and improve.</p>
        <ol className="home-steps" aria-label="How it works">
          <li><span>1</span><div><strong>Upload</strong><small>Add trusted PDF notes or slides.</small></div></li>
          <li><span>2</span><div><strong>Teach</strong><small>Explain the topic in your own words.</small></div></li>
          <li><span>3</span><div><strong>Trace</strong><small>See exactly what your learner understood.</small></div></li>
        </ol>
      </section>

      <section className="home-card" aria-labelledby="lesson-setup-title">
        <div className="home-card-heading">
          <div><p className="eyebrow">New learning session</p><h2 id="lesson-setup-title">What will you teach?</h2></div>
          <span className="privacy-chip">Private session</span>
        </div>
        <form onSubmit={start} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="topic" className="field-label">Topic name</label>
          <input 
            id="topic"
            type="text" 
            maxLength={200}
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            placeholder="e.g. Photosynthesis, Binary Search Trees..."
            className="home-input"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <label htmlFor="materials" className="field-label">Study materials</label>
            <span className="field-hint">PDF · up to 10 MB each · {files.length}/{MAX_FILES}</span>
          </div>
          <div
            data-testid="pdf-drop-zone"
            data-dragging={dragActive}
            className={`upload-dropzone ${dragActive ? "upload-dropzone-active" : ""}`}
            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragActive(false); }}
            onDrop={handleDrop}
          >
            <span aria-hidden className="upload-icon">↑</span>
            <div><strong>Drop PDFs here</strong><p>or choose files from your computer</p></div>
            <label htmlFor="materials" className="secondary-button">Choose PDFs</label>
            <input 
              id="materials"
              type="file" 
              ref={fileInputRef}
              accept=".pdf,application/pdf"
              multiple 
              onChange={handleFileChange}
              className="sr-only"
            />
          </div>
          
          {files.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {files.map((file, i) => (
                <li key={`${file.name}-${file.lastModified}`} className="upload-file">
                  <span aria-hidden>PDF</span>
                  <div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div>
                  <button 
                    type="button" 
                    onClick={() => removeFile(i)}
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <div role="alert" className="home-toast"><span aria-hidden>!</span><p>{error}</p></div>}

        <button
          type="submit"
          disabled={busy}
          className="primary-button home-submit"
        >
          {busy && <span aria-hidden className="button-spinner" />} {busy ? "Starting…" : "Start teaching"}
        </button>
      </form>

      {DEMO_HELPER && (
        <button
          type="button"
          onClick={() => void startDemo()}
          disabled={busy}
          className="secondary-button home-demo"
        >
          Start teaching recursion
        </button>
      )}
      
      <p className="home-disclaimer">
        The learner is a simulation; its answers come only from the verified teaching record, and its score reflects the explanation, not your own mastery.
      </p>
      </section>
    </main>
  );
}
