import { useNavigate } from "react-router-dom";
import { examInfo } from "../data/questions.js";
import "./Dashboard.css";

function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="dash">
      <div className="dash__hall">EXAM HALL</div>

      <div className="dash__ticket">
        <div className="dash__ticketTop">
          <span className="dash__eyebrow">Kartu Ujian</span>
          <span className="dash__code">{examInfo.code}</span>
        </div>

        <h1 className="dash__title">{examInfo.title}</h1>

        <div className="dash__perforation" aria-hidden="true" />

        <dl className="dash__meta">
          <div className="dash__metaRow">
            <dt>Jumlah Soal</dt>
            <dd>{examInfo.totalQuestions} butir</dd>
          </div>
          <div className="dash__metaRow">
            <dt>Waktu</dt>
            <dd>{examInfo.durationMinutes} menit</dd>
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
          onClick={() => navigate("/exam")}
        >
          Mulai Ujian
        </button>
      </div>

      <p className="dash__foot">Pastikan koneksi internet stabil sebelum memulai.</p>
    </div>
  );
}

export default Dashboard;
