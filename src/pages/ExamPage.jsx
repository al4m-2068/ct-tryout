import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useExamSession } from "../contexts/ExamSessionContext.jsx";
import TimerRing from "../components/TimerRing.jsx";
import "../components/TimerRing.css";
import "./ExamPage.css";

const SUBMIT_COUNTDOWN_SECONDS = 5;

function ExamPage() {
  const navigate = useNavigate();
  const {
    exam,
    questions,
    answers,
    status: sessionStatus,
    startedAt,
    submitAnswer,
    finaliseExam,
    isSubmitting,
    beginFinalizing,
    markDone,
    examLoadError,
  } = useExamSession();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [countdown, setCountdown] = useState(SUBMIT_COUNTDOWN_SECONDS);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submitError, setSubmitError] = useState(null);
  const hasExpiredRef = useRef(false);
  const intervalRef = useRef(null);
  const deadlineMs =
    startedAt && exam
      ? new Date(startedAt).getTime() + exam.durationMinutes * 60 * 1000
      : null;

  useEffect(() => {
    if (sessionStatus !== "answering" || !deadlineMs) return undefined;
    if (!questions || questions.length === 0) return undefined;

    const tick = () => {
      if (hasExpiredRef.current) {
        clearInterval(intervalRef.current);
        return;
      }
      const remainingMs = deadlineMs - Date.now();
      if (remainingMs <= 0) {
        hasExpiredRef.current = true;
        setRemainingSeconds(0);
        clearInterval(intervalRef.current);
        beginFinalizing();
        return;
      }
      setRemainingSeconds(Math.ceil(remainingMs / 1000));
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [sessionStatus, deadlineMs, questions, beginFinalizing]);

  useEffect(() => {
    if (sessionStatus !== "finalizing") return undefined;
    if (countdown <= 0) {
      markDone();
      return undefined;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [sessionStatus, countdown, markDone]);

  const question = questions?.[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const isLast = currentIndex === (questions?.length ?? 0) - 1;
  const isFirst = currentIndex === 0;
  const unanswered = useMemo(
    () => (questions ?? []).filter((q) => !answers[q.id]),
    [answers, questions]
  );

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
    setSubmitError(null);
    setCountdown(SUBMIT_COUNTDOWN_SECONDS);
    finaliseExam().catch((err) => {
      if (err.status === 409) {
        setSubmitError("Ujian sudah pernah disubmit. Tidak bisa submit ulang.");
      } else {
        setSubmitError("Submit gagal. Jawaban tetap tersimpan secara lokal. Periksa koneksi dan coba lagi.");
      }
    });
  }

  if (!questions) {
    if (examLoadError) {
      return (
        <div className="exam exam--center">
          <p style={{ padding: "2rem", textAlign: "center", color: "#c0392b" }}>
            Gagal memuat soal ujian.<br />
            Pastikan koneksi internet stabil dan buka ulang halaman ini.
          </p>
        </div>
      );
    }
    return (
      <div className="exam exam--center">
        <p style={{ padding: "2rem", textAlign: "center" }}>
          Memuat soal…
        </p>
      </div>
    );
  }

  if (sessionStatus === "done") {
    return (
      <div className="exam exam--center">
        <div className="finalize">
          <span className="finalize__eyebrow">Selesai</span>
          <h1 className="finalize__title">Ujian Selesai</h1>
          <p className="finalize__note">
            Terima kasih telah mengikuti ujian ini.
          </p>
          <p className="finalize__note">
            {answeredCount} dari {questions?.length ?? "?"} soal terjawab.
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

  if (sessionStatus === "finalizing") {
    return (
      <div className="exam exam--center">
        <div className="finalize">
          <span className="finalize__eyebrow">Jawaban terkunci</span>
          <h1 className="finalize__title">
            {submitError ? "Submit Gagal" : "Ujian sedang difinalisasi"}
          </h1>
          {!submitError && (
            <TimerRing
              secondsLeft={countdown}
              totalSeconds={SUBMIT_COUNTDOWN_SECONDS}
              size={110}
              danger={countdown <= 2}
            />
          )}
          <p className="finalize__note">
            {submitError
              ? submitError
              : "Mohon tunggu, hasil akan tampil otomatis."}
          </p>
          {submitError && (
            <button
              type="button"
              className="finalize__back"
              onClick={() => setSubmitError(null)}
            >
              Kembali ke Soal
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="exam">
      <header className="exam__header">
        <div>
          <span className="exam__eyebrow">{exam.code}</span>
          <h1 className="exam__title">{exam.title}</h1>
        </div>
        <div className="exam__headerRight">
          <div className="exam__progressPill">
            Soal {currentIndex + 1} / {questions?.length ?? "?"}
          </div>
          {sessionStatus === "answering" && remainingSeconds > 0 && (
            <div
              className={`exam__timer${remainingSeconds <= 120 ? " exam__timer--danger" : ""}`}
              role="timer"
              aria-label={`Sisa waktu ${Math.floor(remainingSeconds / 60)} menit ${remainingSeconds % 60} detik`}
            >
              <TimerRing
                secondsLeft={remainingSeconds}
                danger={remainingSeconds <= 120}
              />
            </div>
          )}
        </div>
      </header>

      <nav className="exam__dots" aria-label="Navigasi soal">
        {(questions ?? []).map((q, i) => {
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

        <div
          className="exam__options"
          role="radiogroup"
          aria-label={question.text}
        >
          {question.options.map((opt) => {
            const selected = answers[question.id] === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`option${selected ? " option--selected" : ""}`}
                onClick={() => submitAnswer(question.id, opt.key)}
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
          <button
            type="button"
            className="submitBtn"
            onClick={requestSubmit}
          >
            Submit Jawaban
          </button>
        ) : (
          <button
            type="button"
            className="navBtn navBtn--primary"
            onClick={goNext}
          >
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
                : "Semua soal sudah kamu dijawab."}
            </p>
            <div className="modal__actions">
              <button
                type="button"
                className="navBtn"
                onClick={() => setConfirmOpen(false)}
                disabled={isSubmitting}
              >
                Cek Lagi
              </button>
              <button
                type="button"
                className="submitBtn"
                onClick={confirmSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Menyimpan..." : "Ya, Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExamPage;
