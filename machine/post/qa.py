"""QA checks on the final video.

python3 post/qa.py --video out/<slug>.mp4 --timeline build/<slug>/timeline.json \
    --words build/<slug>/audio/words.json --out out/<slug>_qa.json [--narration …/narration.wav]

Checks (severity error → exit code 1; warn → reported only):
  format      H.264 yuv420p 1080x1920 30 fps, AAC 44.1 kHz stereo ~192 kb/s, moov before mdat (+faststart)
  frames      video frame count == timeline total frames
  duration    video duration == timeline duration (±1 frame), audio == video (±50 ms),
              narration fits in the video (last word end, words.json duration)
  av_sync     stream start offset ≤ 1 frame, and content lag between the final mix and narration.wav
              (speech-envelope cross-correlation) ≤ 40 ms
  loudness    integrated −14 ± 1 LUFS, true peak ≤ −1.0 dBTP (ebur128)
  mix         speech-vs-pause level difference (reference reel: 7.2 dB; music audible in pauses)
  black       black segments (blackdetect, ≥ 98 % of pixels below 8 %): error if any lasts ≥ 0.5 s
"""
import argparse, json, os, re, subprocess, sys

import numpy as np

FPS = 30


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def decode_mono(path, sr=16000, t=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path]
    if t:
        cmd += ["-t", str(t)]
    cmd += ["-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    r = subprocess.run(cmd, capture_output=True)
    return np.frombuffer(r.stdout, np.float32).astype(np.float64)


def band_env(x, sr, hop):
    from scipy import signal
    b, a = signal.butter(4, [250 / (sr / 2), 3500 / (sr / 2)], "band")
    y = signal.lfilter(b, a, x)
    n = len(y) // hop
    return np.sqrt(np.mean(y[:n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)


def top_atoms(path):
    out, off = [], 0
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        while off < size and len(out) < 20:
            f.seek(off)
            h = f.read(16)
            if len(h) < 8:
                break
            n = int.from_bytes(h[:4], "big")
            typ = h[4:8].decode("latin-1")
            if n == 1:
                n = int.from_bytes(h[8:16], "big")
            if n < 8:
                break
            out.append(typ)
            off += n
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--words", required=True)
    ap.add_argument("--narration", help="default: narration.wav next to words.json")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    checks = []

    def check(name, ok, value, expected, severity="error"):
        checks.append({"name": name, "ok": bool(ok), "severity": severity, "value": value, "expected": expected})

    if not os.path.exists(a.video):
        print(f"[qa] ERROR: video not found: {a.video}", file=sys.stderr)
        sys.exit(1)
    tl = json.load(open(a.timeline, encoding="utf-8"))
    wd = json.load(open(a.words, encoding="utf-8"))
    narr = a.narration or os.path.join(os.path.dirname(os.path.abspath(a.words)), "narration.wav")
    total = sum(s["frames"] for s in tl["shots"])

    # ---------------- format
    pr = json.loads(sh(["ffprobe", "-v", "error", "-count_packets", "-show_entries",
                        "stream=index,codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,sample_rate,channels,"
                        "bit_rate,nb_read_packets,start_time,duration:format=duration",
                        "-of", "json", a.video]).stdout)
    v = next((s for s in pr["streams"] if s["codec_type"] == "video"), None)
    au = next((s for s in pr["streams"] if s["codec_type"] == "audio"), None)
    check("video_codec", v and v["codec_name"] == "h264" and v["pix_fmt"] == "yuv420p",
          v and f"{v['codec_name']} {v.get('profile')} {v['pix_fmt']}", "h264 yuv420p")
    check("resolution", v and (v["width"], v["height"]) == (1080, 1920), v and f"{v['width']}x{v['height']}", "1080x1920")
    check("fps", v and v["r_frame_rate"] == "30/1", v and v["r_frame_rate"], "30/1")
    check("audio_codec", au and au["codec_name"] == "aac" and int(au["sample_rate"]) == 44100 and int(au["channels"]) == 2,
          au and f"{au['codec_name']} {au['sample_rate']} Hz {au['channels']} ch", "aac 44100 Hz 2 ch")
    br = int(au.get("bit_rate") or 0) if au else 0
    check("audio_bitrate", 170000 <= br <= 215000, br, "~192000", "warn")
    atoms = top_atoms(a.video)
    check("faststart", "moov" in atoms and "mdat" in atoms and atoms.index("moov") < atoms.index("mdat"),
          " ".join(atoms), "moov before mdat")

    # ---------------- frames / durations
    nfr = int(v["nb_read_packets"]) if v else 0
    check("frame_count", nfr == total, nfr, total)
    vdur = nfr / FPS
    check("video_duration", abs(vdur - float(tl["duration"])) <= 1 / FPS + 1e-6, round(vdur, 3), tl["duration"])
    adur = float(au["duration"]) if au and au.get("duration") else 0.0
    check("audio_duration", abs(adur - vdur) <= 0.05, round(adur, 3), round(vdur, 3))
    words = wd["words"]
    last_end = words[-1]["end"] if words else 0
    ndur = float(wd.get("duration") or last_end)
    check("narration_fits", last_end <= vdur and ndur <= vdur + 0.05, {"last_word_end": last_end, "narration": ndur},
          f"<= {vdur:.2f}")
    check("ending_hold", True, round(vdur - last_end, 2), "info (episode ending.hold)", "info")

    # ---------------- A/V sync
    vst = float(v.get("start_time") or 0) if v else 0
    ast = float(au.get("start_time") or 0) if au else 0
    check("stream_start_offset", abs(vst - ast) <= 1 / FPS, round(ast - vst, 4), "|Δ| <= 0.033 s")
    sr, hop = 16000, 80  # 5 ms envelope
    final = decode_mono(a.video, sr)
    lag_ms = None
    if os.path.exists(narr):
        nx = decode_mono(narr, sr)
        n = min(len(nx), len(final))
        e1, e2 = np.log(band_env(final[:n], sr, hop)), np.log(band_env(nx[:n], sr, hop))
        e1, e2 = e1 - e1.mean(), e2 - e2.mean()
        best, lag_ms = -1e18, 0
        for L in range(-60, 61):  # ±300 ms
            c = np.dot(e1[max(0, L):len(e1) + min(0, L)], e2[max(0, -L):len(e2) - max(0, L)])
            if c > best:
                best, lag_ms = c, L * 1000 * hop / sr
        check("av_sync_content", abs(lag_ms) <= 40, f"{lag_ms:+.0f} ms", "|lag| <= 40 ms (final mix vs narration.wav)")
    else:
        check("av_sync_content", True, "narration.wav not found", "skipped", "warn")

    # ---------------- loudness
    r = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", a.video, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"])
    summ = r.stderr[r.stderr.rfind("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1))
    LRA = float(re.search(r"LRA:\s+(-?[\d.]+) LU", summ).group(1))
    TP = float(re.search(r"Peak:\s+(-?[\d.inf]+) dBFS", summ).group(1))
    check("integrated_loudness", abs(I + 14) <= 1.0, I, "-14 ± 1 LUFS")
    check("integrated_loudness_tight", abs(I + 14) <= 0.5, I, "-14 ± 0.5 LUFS", "warn")
    check("true_peak", TP <= -1.0, TP, "<= -1.0 dBTP")
    check("loudness_range", True, LRA, "info (reference reel: 1.7 LU)", "info")

    # ---------------- mix balance (speech vs pauses, full band, 10 ms frames)
    hop10 = sr // 100
    m = len(final) // hop10
    lev = 10 * np.log10(np.mean(final[:m * hop10].reshape(m, hop10) ** 2, axis=1) + 1e-12)
    sp, pa = np.zeros(m, bool), np.zeros(m, bool)
    for w in words:
        sp[int(w["start"] * 100) + 3:int(w["end"] * 100) - 3] = True
    for w0, w1 in zip(words[:-1], words[1:]):
        if w1["start"] - w0["end"] >= 0.25:
            pa[int(w0["end"] * 100) + 6:int(w1["start"] * 100) - 6] = True
    if sp.any() and pa.sum() >= 20:
        diff = float(np.median(lev[sp[:m]]) - np.median(lev[pa[:m]]))
        check("speech_vs_pause_db", 4.0 <= diff <= 14.0, round(diff, 1),
              "4-14 dB (reference reel 7.2 dB: music clearly under the voice, audible in pauses)", "warn")
    else:
        check("speech_vs_pause_db", True, "not enough pauses to measure", "info", "info")

    # ---------------- black frames
    r = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", a.video, "-an", "-vf",
            "scale=270:480,blackdetect=d=0.1:pic_th=0.98:pix_th=0.08", "-f", "null", "-"])
    segs = [(float(s), float(e), float(d)) for s, e, d in
            re.findall(r"black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)", r.stderr)]
    check("black_segments", all(d < 0.5 for _, _, d in segs), [list(map(lambda x: round(x, 2), s)) for s in segs],
          "no black segment >= 0.5 s")

    errors = [c for c in checks if not c["ok"] and c["severity"] == "error"]
    warns = [c for c in checks if not c["ok"] and c["severity"] == "warn"]
    rep = {"video": os.path.abspath(a.video), "ok": not errors, "errors": len(errors), "warnings": len(warns),
           "summary": {"frames": nfr, "duration": round(vdur, 3), "lufs": I, "true_peak": TP, "lra": LRA,
                       "av_lag_ms": lag_ms}, "checks": checks}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(rep, open(a.out, "w", encoding="utf-8"), indent=1, default=str)
    print(f"QA {os.path.basename(a.video)}")
    for c in checks:
        mark = "ok  " if c["ok"] else ("FAIL" if c["severity"] == "error" else "warn")
        if c["severity"] == "info":
            mark = "info"
        print(f"  [{mark}] {c['name']:24} {str(c['value'])[:70]:70}  ({c['expected']})")
    print(f"QA {'PASSED' if not errors else 'FAILED'}: {len(errors)} error(s), {len(warns)} warning(s) → {a.out}")
    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
