import fs from "node:fs";
import { execFileSync } from "node:child_process";

const LANG = process.env.KYC_LANG === "ar" ? "ar" : "en";
const FFMPEG = "/tmp/guide-deck/node_modules/ffmpeg-static/ffmpeg";
const PY = "/tmp/guide-deck/tts/bin/python";
const REC = process.env.KYC_REC || "/tmp/kyc-guide/rec-" + LANG;
const OUT = process.env.KYC_OUT || "/home/negt/MIS/kyc-flow/walkthrough/NEWEAST-KYC-Walkthrough" + (LANG === "ar" ? "-AR" : "-EN") + ".mp4";
const VOICE = REC + "/voice.m4a";
const SPEAK = "/home/negt/HQ_NEWESAT_GUESTVISIT/docs/user-guide/speak-captions.py";
const FONT = LANG === "ar" ? "DejaVu Sans" : "Liberation Sans";

const data = JSON.parse(fs.readFileSync(REC + "/captions.json", "utf8"));
const TARGET = Math.max(data.total, 1);
const k = 1;

const frames = data.frames.filter((f) => f.at > -1).map((f) => ({ ...f, at: Math.max(0, f.at) }));
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const next = i + 1 < frames.length ? frames[i + 1].at : data.total;
  const d = Math.max(0.001, (next - frames[i].at) * k);
  lines.push("file '" + frames[i].file + "'", "duration " + d.toFixed(4));
}
lines.push("file '" + frames[frames.length - 1].file + "'");
fs.writeFileSync(REC + "/list.txt", lines.join("\n") + "\n");

const stamp = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return h + ":" + String(m).padStart(2, "0") + ":" + sec;
};
const esc = (t) => t.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");

const events = data.captions.map((c, i) => {
  const start = c.at * k;
  const end = (i + 1 < data.captions.length ? data.captions[i + 1].at : data.total) * k - 0.05;
  const [lead, rest] = c.text.includes(" — ") ? c.text.split(" — ") : [null, c.text];
  const body = lead
    ? "{\\b1\\fs52\\c&H8A89E8&}" + esc(lead) + "{\\b0\\fs42\\c&HFFFFFF&}\\N" + esc(rest)
    : "{\\fs44}" + esc(c.text);
  const dir = LANG === "ar" ? "{\\an2\\q2}" : "{\\an2}";
  return "Dialogue: 0," + stamp(start) + "," + stamp(end) + ",Cap,,0,0,0,," + dir + "{\\fad(160,100)}" + body;
});

const ass = [
  "[Script Info]",
  "ScriptType: v4.00+",
  "PlayResX: 1920",
  "PlayResY: 1080",
  "WrapStyle: 2",
  LANG === "ar" ? "PlayResY: 1080" : "",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Cap," + FONT + ",42,&H00FFFFFF,&H00FFFFFF,&H00181010,&HEE1A1010,1,0,0,0,100,100,0.3,0,3,14,0,2,80,80,70,1",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  events.join("\n"),
  "",
].join("\n");
fs.writeFileSync(REC + "/captions.ass", ass);

const srt = data.captions
  .map((c, i) => {
    const start = c.at * k;
    const end = (i + 1 < data.captions.length ? data.captions[i + 1].at : data.total) * k - 0.05;
    const t = (s) => stamp(s).replace(/^(\d):/, "0$1:").replace(".", ",") + "0";
    return i + 1 + "\n" + t(start) + " --> " + t(end) + "\n" + c.text + "\n";
  })
  .join("\n");
fs.writeFileSync(OUT.replace(/\.mp4$/, ".srt"), srt);

const voicedir = REC + "/voice";
fs.rmSync(voicedir, { recursive: true, force: true });
fs.mkdirSync(voicedir, { recursive: true });

function mediaDuration(file) {
  try {
    execFileSync(FFMPEG, ["-i", file], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    const match = String(error.stderr || "").match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    if (!match) return 0;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return 0;
}

function writeSilence(file, seconds) {
  const dur = Math.max(0.05, seconds);
  execFileSync(
    FFMPEG,
    ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", dur.toFixed(3), "-c:a", "pcm_s16le", file],
    { stdio: "inherit" },
  );
}

const spoken = data.captions.map((c) => c.text.replace(/ — /g, ". ").replace(/ · /g, ". "));
execFileSync(PY, [SPEAK, JSON.stringify(spoken), voicedir, LANG], { stdio: "inherit" });

for (let i = 0; i < spoken.length; i++) {
  const n = String(i).padStart(3, "0");
  execFileSync(
    FFMPEG,
    ["-y", "-hide_banner", "-loglevel", "error", "-i", voicedir + "/" + n + ".mp3", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", voicedir + "/" + n + ".wav"],
    { stdio: "inherit" },
  );
}

const concat = [];
let cursor = 0;
data.captions.forEach((caption, i) => {
  const n = String(i).padStart(3, "0");
  const wav = voicedir + "/" + n + ".wav";
  const start = Math.max(0, caption.at * k);
  const gap = start - cursor;
  if (gap > 0.04) {
    const hush = voicedir + "/gap-" + n + ".wav";
    writeSilence(hush, gap);
    concat.push("file '" + hush + "'");
    cursor += gap;
  }
  concat.push("file '" + wav + "'");
  cursor += mediaDuration(wav);
});
if (cursor < TARGET - 0.05) {
  const tail = voicedir + "/tail.wav";
  writeSilence(tail, TARGET - cursor);
  concat.push("file '" + tail + "'");
}
fs.writeFileSync(voicedir + "/list.txt", concat.join("\n") + "\n");

const rawVoice = REC + "/voice-raw.wav";
execFileSync(
  FFMPEG,
  ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", voicedir + "/list.txt", "-c:a", "pcm_s16le", rawVoice],
  { stdio: "inherit" },
);

execFileSync(
  FFMPEG,
  [
    "-y", "-hide_banner", "-loglevel", "error", "-i", rawVoice,
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,highpass=f=80,lowpass=f=12000,aresample=48000",
    "-c:a", "aac", "-b:a", "192k", "-t", String(TARGET), VOICE,
  ],
  { stdio: "inherit" },
);

const fadeOut = (TARGET - 0.8).toFixed(2);
execFileSync(
  FFMPEG,
  [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", REC + "/list.txt",
    "-i", VOICE,
    "-vf",
    "scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x1E1818,fps=30,fade=t=in:st=0:d=0.5,fade=t=out:st=" + fadeOut + ":d=0.7,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-c:a", "copy", "-shortest", "-movflags", "+faststart", "-t", String(TARGET),
    OUT,
  ],
  { stdio: "inherit" },
);
console.log(OUT, "seconds", TARGET.toFixed(1), "voice", mediaDuration(VOICE).toFixed(1));
