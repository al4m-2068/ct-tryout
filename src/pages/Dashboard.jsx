import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useExamSession } from "../contexts/ExamSessionContext.jsx";
import "./Dashboard.css";

function Dashboard() {
  const navigate = useNavigate();
  const { exam, startSession } = useExamSession();
  const [startError, setStartError] = useState(null);

  if (!exam) {
    return (
      <div className="dash">
        <div className="dash__hall">EXAM HALL</div>
        <div className="dash__ticket">
          <p style={{ padding: "1rem", textAlign: "center" }}>
            Memuat data ujian…
          </p>
        </div>
      </div>
    );
  }

  async function handleStart() {
    setStartError(null);
    try {
      const sessionUuid = crypto.randomUUID();
      await startSession(sessionUuid);
      navigate("/exam");
    } catch (err) {
      if (err.status === 409) {
        setStartError(
          "Kamu sudah memiliki sesi ujian untuk ujian ini. Hanya satu kali attempt yang diizinkan."
        );
      } else {
        setStartError("Gagal memulai ujian. Pastikan koneksi internet stabil dan coba lagi.");
      }
    }
  }

  return (
    <div className="dash">
      <div className="dash__hall">EXAM HALL</div>

      <div className="dash__ticket">
        <div className="dash__ticketTop">
          <span className="dash__eyebrow">Kartu Ujian</span>
          <span className="dash__code">{exam.code}</span>
        </div>

        <h1 className="dash__title">{exam.title}</h1>

        <div className="dash__perforation" aria-hidden="true" />

        <dl className="dash__meta">
          <div className="dash__metaRow">
            <dt>Jumlah Soal</dt>
            <dd>{exam.totalQuestions} butir</dd>
          </div>
          <div className="dash__metaRow">
            <dt>Waktu</dt>
            <dd>{exam.durationMinutes} menit</dd>
          </div>
          <div className="dash__metaRow">
            <dt>Tipe Soal</dt>
            <dd>Pilihan Ganda</dd>
          </div>
        </dl>

        <ul className="dash__rules">
          <li>Kerjakan semua soal sebelum waktu habis.</li>
          <li>Kamu bisa berpindah soal lewat tombol Prev / Next.</li>
          <li>Jawaban tersimpan otomatis, submit kapan saja kamu siap.</li>
        </ul>

        <button
          type="button"
          className="dash__start"
          onClick={handleStart}
        >
          Mulai Ujian
        </button>
      </div>

      {startError && (
        <p className="dash__error" role="alert">
          {startError}
        </p>
      )}

      <p className="dash__foot">Pastikan koneksi internet stabil sebelum memulai.</p>
    </div>
  );
}

export default Dashboard;
