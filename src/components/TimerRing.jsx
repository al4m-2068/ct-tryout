function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

// Ring countdown: chalk-drawn circle yang "terhapus" seiring waktu berjalan.
function TimerRing({ secondsLeft, totalSeconds, size = 84, danger = false }) {
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const offset = circumference * (1 - progress);

  return (
    <div
      className={`timerRing${danger ? " timerRing--danger" : ""}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="polite"
      aria-label={`Sisa waktu ${formatTime(secondsLeft)}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="timerRing__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
        />
        <circle
          className="timerRing__progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="timerRing__label">{formatTime(secondsLeft)}</span>
    </div>
  );
}

export default TimerRing;
