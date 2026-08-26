import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { questions, examInfo } from "../data/questions.js";
import TimerRing from "../components/TimerRing.jsx";
import "../components/TimerRing.css";
import "./ExamPage.css";

const SUBMIT_COUNTDOWN_SECONDS = 5;

function ExamPage() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // status: "answering" | "finalizing" | "done"
  const [status, setStatus] = useState("answering");
  const [countdown, setCountdown] = useState(SUBMIT_COUNTDOWN_SECONDS);

  const question = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const isLast = currentIndex === questions.length - 1;
  const isFirst = currentIndex === 0;

  // Timer itung mundur yang jalan SETELAH user submit (bukan selama
  // ngerjain soal) -- selama "finalizing" ini, jawaban lagi "dikunci".
  useEffect(() => {
    if (status !== "finalizing") return undefined;

    if (countdown <= 0) {
      setStatus("done");
      return undefined;
    }

    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [status, countdown]);

  function selectAnswer(key) {
    setAnswers((prev) => ({ ...prev, [question.id]: key }));
  }

  function goPrev() {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
  }

  function requestSubmit() {
    setConfirmOpen(true);
  }

  function confirmSubmit() {
    setConfirmOpen(false);
    setCountdown(SUBMIT_COUNTDOWN_SECONDS);
    setStatus("finalizing");
  }

  const unanswered = useMemo(
    () => questions.filter((q) => !answers[q.id]),
    [answers]
  );

  if (status === "finalizing") {
    return (
      <div className="exam exam--center">
        <div className="finalize">
          <span className="finalize__eyebrow">Jawaban terkunci</span>
          <h1 className="finalize__title">Ujian sedang difinalisasi</h1>
          <TimerRing
            secondsLeft={countdown}
            totalSeconds={SUBMIT_COUNTDOWN_SECONDS}
            size={110}
            danger={countdown <= 2}
          />
          <p className="finalize__note">
            Mohon tunggu, hasil akan tampil otomatis.
          </p>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="exam exam--center">
        <div className="finalize">
          <span className="finalize__eyebrow">Selesai</span>
          <h1 className="finalize__title">Jawaban kamu sudah tersimpan</h1>
          <p className="finalize__note">
            {answeredCount} dari {questions.length} soal terjawab.
          </p>
          <button
            type="button"
            className="finalize__back"
            onClick={() => navigate("/")}
          >
            Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="exam">
      <header className="exam__header">
        <div>
          <span className="exam__eyebrow">{examInfo.code}</span>
          <h1 className="exam__title">{examInfo.title}</h1>
        </div>
        <div className="exam__progressPill">
          Soal {currentIndex + 1} / {questions.length}
        </div>
      </header>

      <nav className="exam__dots" aria-label="Navigasi soal">
        {questions.map((q, i) => {
          const state =
            i === currentIndex
              ? "current"
              : answers[q.id]
              ? "answered"
              : "empty";
          return (
            <button
              key={q.id}
              type="button"
              className={`exam__dot exam__dot--${state}`}
              onClick={() => setCurrentIndex(i)}
              aria-label={`Ke soal ${i + 1}${
                answers[q.id] ? " (sudah dijawab)" : ""
              }`}
              aria-current={i === currentIndex ? "true" : undefined}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>

      <main className="exam__card">
        <p className="exam__question">{question.text}</p>

        <div className="exam__options" role="radiogroup" aria-label={question.text}>
          {question.options.map((opt) => {
            const selected = answers[question.id] === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`option${selected ? " option--selected" : ""}`}
                onClick={() => selectAnswer(opt.key)}
              >
                <span className="option__bubble">{opt.key}</span>
                <span className="option__text">{opt.text}</span>
              </button>
            );
          })}
        </div>
      </main>

      <footer className="exam__footer">
        <button
          type="button"
          className="navBtn"
          onClick={goPrev}
          disabled={isFirst}
        >
          ← Prev
        </button>

        {isLast ? (
          <button type="button" className="submitBtn" onClick={requestSubmit}>
            Submit Jawaban
          </button>
        ) : (
          <button type="button" className="navBtn navBtn--primary" onClick={goNext}>
            Next →
          </button>
        )}
      </footer>

      {confirmOpen && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2 className="modal__title">Yakin mau submit?</h2>
            <p className="modal__body">
              {unanswered.length > 0
                ? `Masih ada ${unanswered.length} soal yang belum dijawab. Jawaban yang sudah diisi tetap akan disimpan.`
                : "Semua soal sudah kamu jawab."}
            </p>
            <div className="modal__actions">
              <button
                type="button"
                className="navBtn"
                onClick={() => setConfirmOpen(false)}
              >
                Cek Lagi
              </button>
              <button type="button" className="submitBtn" onClick={confirmSubmit}>
                Ya, Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExamPage;
