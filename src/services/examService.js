const API_BASE = "http://localhost:5000/api";

function normaliseOptions(raw) {
  if (Array.isArray(raw)) {
    if (raw.length > 0 && typeof raw[0] === "object" && raw[0] !== null && "key" in raw[0]) {
      return raw;
    }

    const CANONICAL_KEYS = ["A", "B", "C", "D"];
    return CANONICAL_KEYS.filter((_, i) => i < raw.length).map((key, i) => ({
      key,
      text: String(raw[i]),
    }));
  }

  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const CANONICAL_KEYS = ["A", "B", "C", "D"];
    return CANONICAL_KEYS.filter((key) => key in raw).map((key) => ({
      key,
      text: String(raw[key]),
    }));
  }

  return [];
}

export async function getExam(examCode) {
  const res = await fetch(`${API_BASE}/exams/${encodeURIComponent(examCode)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch exam "${examCode}": HTTP ${res.status}`);
  }
  const raw = await res.json();
  const data = raw && typeof raw === "object" && "data" in raw ? raw.data : raw;
  const questions = (data.questions || []).map((q) => ({
    ...q,
    options: normaliseOptions(q.options),
  }));
  return { exam: data.exam || {}, questions };
}

export async function saveAnswer(sessionUuid, questionId, selectedOption) {
  const res = await fetch(`${API_BASE}/exam-sessions/${encodeURIComponent(sessionUuid)}/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, selectedOption }),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.message) message = body.message;
    } catch {}
    throw Object.assign(new Error(message), { status: res.status });
  }
  return res.json();
}

export async function createSession({ studentId, examCode, sessionUuid }) {
  const res = await fetch(`${API_BASE}/exam-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId, examCode, sessionUuid }),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.message) message = body.message;
    } catch {}
    throw Object.assign(new Error(message), { status: res.status });
  }
  const raw = await res.json();
  return raw.data || raw;
}
