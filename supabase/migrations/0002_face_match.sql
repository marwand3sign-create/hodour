-- Real face-identity verification: geometric landmark embedding + similarity score.
-- The camera only detects a face is present (see face.js); this adds a comparison
-- against the employee's first-ever check-in photo, computed client-side from
-- MediaPipe FaceLandmarker output. It's a heuristic (landmark geometry, not a
-- trained recognition model) so it flags for manager review rather than blocking.

alter table employees add column reference_embedding jsonb;

alter table attendance add column face_match_score numeric;
alter table attendance add column face_mismatch boolean default false;
alter table attendance add column out_face_match_score numeric;
alter table attendance add column out_face_mismatch boolean default false;
