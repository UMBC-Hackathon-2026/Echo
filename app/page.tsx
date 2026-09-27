"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { EXTRACTION_FAILURE, MAX_FILES, pdfProblem } from "@/lib/topics/upload-policy";


export default function Home() {
  const router = useRouter();
  const [topicName, setTopicName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (!e.target.files) return;
    
    const selectedFiles = Array.from(e.target.files);
    
    if (selectedFiles.length + files.length > MAX_FILES) {
      setError(`You can only upload up to ${MAX_FILES} PDFs.`);
      return;
    }

    const validFiles = selectedFiles.filter(file => {
      const problem = pdfProblem(file);
      if (problem) {
        setError(problem);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
      
      const res = await fetch("/api/topics/create", { method: "POST", body: formData });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const wait = Number(res.headers.get("retry-after"));
        const message = typeof errorData.error === "string" ? errorData.error : EXTRACTION_FAILURE;
        throw new Error(res.status === 429 && wait > 0 ? `${message} Try again in ${wait} seconds.` : message);
      }
      const { topicId } = await res.json();
      
      const dto = await api.createSession({ topicId });
      router.push(`/session/${dto.sessionId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : EXTRACTION_FAILURE);
      setFailed(true);
      setBusy(false);
    }
  }

  if (busy || failed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="flex flex-col gap-4 items-center">
          {busy && <div aria-hidden="true" className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900 dark:border-zinc-800 dark:border-t-zinc-100"></div>}
          <h1 aria-live="polite" className="text-2xl font-semibold tracking-tight">{failed ? "We couldn't prepare your lesson" : "Analyzing materials..."}</h1>
          {failed ? <>
            <p role="alert" className="text-zinc-600 dark:text-zinc-400">{error}</p>
            <button type="button" className="rounded-md border px-4 py-2" onClick={() => { setFailed(false); setError(null); }}>Review documents and try again</button>
          </> : <p className="text-zinc-600 dark:text-zinc-400">
            Extracting core concepts, common misconceptions, and building an assessment rubric.<br/>
            Please keep this page open while your documents are processed.
          </p>}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 p-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">The Inverse Tutor</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Upload your study materials (slides, notes, practice exams). We will simulate a learner who knows nothing about it. Teach the simulated learner, watch it take an assessment, and see how well you explained the core concepts.
        </p>
      </div>
      
      <form onSubmit={start} className="w-full flex flex-col gap-5 mt-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="topic" className="text-sm font-medium">Topic Name</label>
          <input 
            id="topic"
            type="text" 
            maxLength={200}
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            placeholder="e.g. Photosynthesis, Binary Search Trees..."
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 dark:border-zinc-700 dark:focus:border-zinc-400"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Study Materials (PDF only, up to {MAX_FILES})</label>
          <div className="rounded-md border-2 border-dashed border-zinc-300 p-6 flex flex-col items-center justify-center gap-2 dark:border-zinc-700">
            <span className="text-sm text-zinc-500">Select PDF files (up to 10MB each)</span>
            <input 
              type="file" 
              ref={fileInputRef}
              accept=".pdf,application/pdf"
              multiple 
              onChange={handleFileChange}
              className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-zinc-100 file:text-zinc-900 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-100"
            />
          </div>
          
          {files.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {files.map((file, i) => (
                <li key={i} className="flex items-center justify-between bg-zinc-50 px-3 py-2 rounded-md text-sm dark:bg-zinc-800/50">
                  <span className="truncate max-w-[80%]">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                  <button 
                    type="button" 
                    onClick={() => removeFile(i)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 w-full rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Starting…" : "Start teaching"}
        </button>
      </form>
      
      <p className="max-w-xl text-xs text-zinc-500 mt-4">
        The learner is a simulation; its answers come only from the verified teaching record, and its score reflects the explanation, not your own mastery.
      </p>
    </main>
  );
}
