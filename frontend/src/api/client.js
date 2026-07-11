async function request(method, url, { token, deviceToken, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (deviceToken) headers['X-Device-Token'] = deviceToken;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    // no JSON body
  }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  register: (body) => request('POST', '/api/auth/register', { body }),
  login: (body) => request('POST', '/api/auth/login', { body }),
  getCoachStudents: (coachId, token) => request('GET', `/api/coaches/${coachId}/students`, { token }),
  getStudentGoals: (studentId, token) => request('GET', `/api/students/${studentId}/goals`, { token }),
  createGoal: (body, token) => request('POST', '/api/goals', { body, token }),
  getStudentSessions: (studentId, token) => request('GET', `/api/students/${studentId}/sessions`, { token }),
  startSession: (body, token) => request('POST', '/api/sessions', { body, token }),
  getSession: (sessionId, token) => request('GET', `/api/sessions/${sessionId}`, { token }),
  postRep: (sessionId, body, token) => request('POST', `/api/sessions/${sessionId}/reps`, { body, token }),
  completeSession: (sessionId, token) => request('POST', `/api/sessions/${sessionId}/complete`, { token }),
};
